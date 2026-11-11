import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { CLAUDE_MODEL } from "./claude";
import { getAnthropicApiKey } from "./env";
import { TASK_REGISTRY, positionLabel } from "@/content/tasks/registry";
import {
  EMPTY_EDITS,
  EMPTY_UNIT,
  clearOverride,
  effectiveContent,
  getOverrides,
  setOverride,
  type EditableField,
  type UnitEdits,
  type WorksheetEdits,
} from "./content-overrides";
import { markDoneUpTo, setUnitDone, unitsOverview, getPlan } from "./lesson-plan";
import { chapterLength, formatVerseNums, normalizeVerseSpec, parseVerseSpec } from "./verse-spec";
import {
  allTasksWithStats,
  cancelTaskAssignment,
  getTask,
  now,
  publishUnit,
  republishTask,
  taskRoster,
  updateTaskDueDate,
} from "./tasks";
import { approveUser, blockUser, listAccounts, makeStudent, makeTeacher, preApproveEmail, renameUser, restoreUserName, unblockUser } from "./approval";
import { mergeAccounts, planMerge } from "./account-merge";
import { sendGroupMessage, sendMessage } from "./messages";
import { skillsReport } from "./skills-report";
import { MIN_ANSWERS } from "./skills-map";
import { formatHebDateTime, israelLocalToUnix } from "./hebrew";
import { applyExamPatch, getExam, listExams, questionNumbers, saveExam, totalPoints, EXAM_STATUS_LABEL, type ExamDoc, type ExamPatch } from "./exams";
import { applyPrepPatch, getPrepForExam, prepClassProgress, savePrep, type PrepDoc, type PrepPatch } from "./exam-prep";
import { SLIDE_BLOCK_ICON, SLIDE_BLOCK_KEYS, cleanSlide, getSlide, saveSlide, type SlideDoc } from "./class-slide";
import {
  CLAUSE_STATUS_META,
  addClause,
  cleanClauseInput,
  deleteClause,
  getClause,
  listClauses,
  moveClause,
  proposalsForUnit,
  proposalsOverview,
  restoreClause,
  setProposalFlags,
  updateClause,
  type Clause,
  type ClauseInput,
} from "./amana";

// ריעות ↔ קלוד — the teacher's direct chat with Claude inside the site.
// Whatever she wants changed, she writes here. Claude has TOOLS that are the
// site's own actions: reading units, students and progress runs at once;
// anything that CHANGES something is first shown to her as a card ("זה מה
// שאשנה"), and runs only when she taps ✓. Nothing waits for Rafael. A request
// that needs new code goes to GitHub as an issue the Claude Code action
// implements, builds and merges by itself (see .github/workflows).

// ---------------------------------------------------------------- site ----
export const SITE = {
  name: "קדושים תהיו",
  grade: "ט",
  repo: process.env.GITHUB_REPO ?? "RefaelBassel/kedoshim-tihyu",
  vercelProject: process.env.VERCEL_PROJECT_SLUG ?? "kedoshim-tihyu",
  vercelTeam: process.env.VERCEL_TEAM_SLUG ?? "refaelbassels-projects",
  prodUrl: process.env.SITE_URL ?? "https://kedoshim-tihyu.vercel.app",
  // the sister site (same architecture, separate repository) a request may
  // also be sent to — its own pipeline builds it from the description alone
  sisters: { "binat-hatorah": { name: "בינת התורה", repo: "RefaelBassel/binat-hatorah" } } as Record<string, { name: string; repo: string }>,
};

// -------------------------------------------------------------- tables ----
let ready = false;
export async function ensureChatTables() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS teacher_chat_messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       thread INTEGER NOT NULL DEFAULT 1,
       role TEXT NOT NULL,            -- 'user' | 'assistant'
       content_json TEXT NOT NULL,    -- the API message content (blocks)
       created_at INTEGER NOT NULL
     )`
  );
  await db().execute(
    `CREATE TABLE IF NOT EXISTS teacher_chat_actions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       thread INTEGER NOT NULL DEFAULT 1,
       tool TEXT NOT NULL,
       input_json TEXT NOT NULL,
       summary TEXT NOT NULL,
       preview_json TEXT,
       status TEXT NOT NULL DEFAULT 'pending', -- pending | applied | dismissed | undone | failed
       undo_json TEXT,
       result_json TEXT,
       created_at INTEGER NOT NULL,
       applied_at INTEGER
     )`
  );
  await db().execute(
    `CREATE TABLE IF NOT EXISTS code_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id INTEGER NOT NULL,
       title TEXT NOT NULL,
       body TEXT NOT NULL,
       issue_number INTEGER,
       issue_url TEXT,
       pr_url TEXT,
       branch TEXT,
       status TEXT NOT NULL DEFAULT 'queued', -- queued | open | working | preview | merged | failed | closed
       note TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  );
  // older tables: "large" requests are built with Opus, the rest with Sonnet
  try {
    await db().execute("ALTER TABLE code_requests ADD COLUMN size TEXT");
  } catch {
    /* column exists */
  }
  // older tables: when a paused request was last re-triggered
  try {
    await db().execute("ALTER TABLE code_requests ADD COLUMN retried_at INTEGER");
  } catch {
    /* column exists */
  }
  // older tables: the target repository of a request (cross-site requests)
  try {
    await db().execute("ALTER TABLE code_requests ADD COLUMN repo TEXT");
  } catch {
    /* column exists */
  }
  // older tables: a question the build asked on GitHub, relayed to the chat
  // …and the fix rounds of a request: its round number, when the last round
  // was sent, a fix waiting to be sent, and which round the chat was told about
  for (const col of ["question TEXT", "question_comment_id INTEGER", "round INTEGER", "revised_at INTEGER", "pending_fix TEXT", "fix_at INTEGER", "announced_round INTEGER"]) {
    try {
      await db().execute(`ALTER TABLE code_requests ADD COLUMN ${col}`);
    } catch {
      /* column exists */
    }
  }
  ready = true;
}

export interface ChatMessageRow {
  id: number;
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
  createdAt: number;
}
export interface ActionRow {
  id: number;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  preview: unknown;
  status: string;
  undoable: boolean;
  createdAt: number;
  appliedAt: number | null;
  result: unknown;
}
export interface CodeRequestRow {
  id: number;
  title: string;
  body: string;
  issueNumber: number | null;
  issueUrl: string | null;
  prUrl: string | null;
  previewUrl: string | null;
  status: string;
  note: string | null;
  question: string | null;
  round: number;
  fixPending: boolean;
  createdAt: number;
  updatedAt: number;
}

async function currentThread(userId: number): Promise<number> {
  const r = await db().execute({ sql: "SELECT MAX(thread) AS t FROM teacher_chat_messages WHERE user_id = ?", args: [userId] });
  return Number(r.rows[0]?.t ?? 0) || 1;
}

export interface ThreadInfo {
  thread: number;
  title: string; // the first thing the teacher wrote in it
  startedAt: number;
  count: number;
}
export async function listThreads(userId: number): Promise<ThreadInfo[]> {
  await ensureChatTables();
  const r = await db().execute({
    sql: `SELECT thread, MIN(created_at) AS started_at, COUNT(*) AS n,
                 (SELECT content_json FROM teacher_chat_messages m2 WHERE m2.user_id = m.user_id AND m2.thread = m.thread AND m2.role = 'user' ORDER BY id LIMIT 1) AS first_json
          FROM teacher_chat_messages m WHERE user_id = ? GROUP BY thread ORDER BY thread DESC LIMIT 40`,
    args: [userId],
  });
  return r.rows.map((x) => {
    let title = "שיחה";
    try {
      const blocks = JSON.parse(String(x.first_json ?? "[]")) as { type: string; text?: string }[];
      const t = blocks.find((b) => b.type === "text" && b.text)?.text ?? "";
      title = t.replace(/^\[[^\]]*\]\n/, "").trim().slice(0, 60) || "שיחה";
    } catch {
      /* keep */
    }
    return { thread: Number(x.thread), title, startedAt: Number(x.started_at), count: Number(x.n) };
  });
}

export async function loadChat(userId: number, which?: number | null): Promise<{ thread: number; messages: ChatMessageRow[]; actions: ActionRow[]; codeRequests: CodeRequestRow[]; threads: ThreadInfo[] }> {
  await ensureChatTables();
  const latest = await currentThread(userId);
  const thread = which && which > 0 && which <= latest ? which : latest;
  const m = await db().execute({
    sql: "SELECT id, role, content_json, created_at FROM teacher_chat_messages WHERE user_id = ? AND thread = ? ORDER BY id",
    args: [userId, thread],
  });
  const messages: ChatMessageRow[] = m.rows.map((r) => ({
    id: Number(r.id),
    role: String(r.role) as "user" | "assistant",
    content: JSON.parse(String(r.content_json)),
    createdAt: Number(r.created_at),
  }));
  const a = await db().execute({
    sql: "SELECT * FROM teacher_chat_actions WHERE user_id = ? AND thread = ? ORDER BY id",
    args: [userId, thread],
  });
  const actions = a.rows.map(rowToAction);
  const codeRequests = await listCodeRequests(userId);
  const threads = await listThreads(userId);
  return { thread, messages, actions, codeRequests, threads };
}

function rowToAction(r: Record<string, unknown>): ActionRow {
  return {
    id: Number(r.id),
    tool: String(r.tool),
    input: JSON.parse(String(r.input_json)),
    summary: String(r.summary),
    preview: r.preview_json ? JSON.parse(String(r.preview_json)) : null,
    status: String(r.status),
    undoable: r.undo_json != null && String(r.status) === "applied",
    createdAt: Number(r.created_at),
    appliedAt: r.applied_at != null ? Number(r.applied_at) : null,
    result: r.result_json ? JSON.parse(String(r.result_json)) : null,
  };
}

export async function newThread(userId: number) {
  await ensureChatTables();
  const t = (await currentThread(userId)) + 1;
  // an empty marker row keeps MAX(thread) pointing at the new one
  await db().execute({
    sql: "INSERT INTO teacher_chat_messages (user_id, thread, role, content_json, created_at) VALUES (?, ?, 'user', ?, ?)",
    args: [userId, t, JSON.stringify([{ type: "text", text: "(שיחה חדשה)" }]), now()],
  });
  await db().execute({
    sql: "INSERT INTO teacher_chat_messages (user_id, thread, role, content_json, created_at) VALUES (?, ?, 'assistant', ?, ?)",
    args: [userId, t, JSON.stringify([{ type: "text", text: "שיחה חדשה. במה אפשר לעזור?" }]), now()],
  });
}

// ------------------------------------------------------------- helpers ----
const compact = (v: unknown) => JSON.stringify(v);
const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const unitsMap = () =>
  Object.entries(TASK_REGISTRY)
    .map(([ref, reg]) => `${ref} — ${reg.content.title}${positionLabel(ref) ? ` (${positionLabel(ref)})` : ""}`)
    .join("\n");

async function unitSnapshot(ref: string) {
  const reg = TASK_REGISTRY[ref];
  if (!reg) return null;
  const content = await effectiveContent(reg.content);
  const ov = await getOverrides(ref);
  return {
    ref,
    title: content.title,
    subtitle: content.subtitle ?? null,
    readingIntro: content.readingIntro ?? null,
    position: positionLabel(ref),
    bookRef: content.bookRef,
    skill: content.skill,
    review: content.review ?? null,
    discussion: content.discussion ?? null,
    sections: content.sections.map((s) => ({
      key: s.key,
      title: s.title,
      minutes: s.minutes ?? null,
      blocks: s.blocks.map((b) => {
        if (b.type === "question") return { key: b.key, type: b.type, label: b.label, prompt: b.prompt, helper: b.helper ?? null, fields: b.fields ?? null, minWords: b.minWords ?? null, verses: b.verses ?? null };
        if (b.type === "intro") return { key: b.key, type: b.type, title: b.title ?? null, body: b.body };
        if (b.type === "source") return { key: b.key, type: b.type, title: b.title, text: b.text };
        if (b.type === "case") return { key: b.key, type: b.type, title: (b as { title?: string }).title ?? null, body: (b as { body?: string }).body ?? null };
        if (b.type === "art") return { key: b.key, type: b.type, caption: (b as { caption?: string }).caption ?? null };
        return { key: b.key, type: b.type };
      }),
    })),
    edited: { worksheet: !!ov.worksheet, unit: !!ov.unit, discussion: !!ov.discussion, review: !!ov.review },
    hiddenQuestions: ov.worksheet?.hidden ?? [],
  };
}

// --------------------------------------------------------------- tools ----
// READ tools run at once. WRITE tools only PROPOSE: the server records an
// action and tells Claude "proposed — waiting for the teacher's ✓".
const READ_TOOLS = new Set(["list_units", "get_unit", "list_students", "class_progress", "list_tasks", "get_lesson_plan", "list_code_requests", "list_exams", "get_exam", "get_class_slide", "get_amana", "get_amana_proposals", "skills_report"]);

const PREP_ITEM_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["update", "add", "delete", "move"] },
    itemId: { type: "string", description: "update / delete / move: the practice item's id (from get_exam)" },
    position: { type: "integer", description: "add / move: 1-based place in the practice list" },
    kind: { type: "string", enum: ["choice", "multi", "verse", "etnachta", "short", "open"], description: "choice = one right option; multi = all right options; verse = 'in which verse' (correct = verse numbers in Hebrew letters); etnachta = the student clicks the etnachta word of verseNum; short = a word or two (correct = accepted answers); open = self-check against the explanation" },
    text: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    correct: { type: "array", items: { type: "string" }, description: "choice/multi: the right options, word for word" },
    explain: { type: "string", description: "shown after a right answer" },
    verseNum: { type: "string" },
  },
  required: ["op"],
  additionalProperties: false,
} as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "revise_code_request",
    description: "A fix to something a code request already built (or is building): the teacher looked at the result and wants it changed (\"not like that\", move, rename, add what is missing, it does not work). Goes to the SAME request as a fix round — the build sees the original spec, what was built and this remark. codeRequestId: the request (from the \"✅ … (בקשה #N)\" message, the card, or list_code_requests). feedback: all her remarks in one complete, self-contained Hebrew text — what she sees now, and what it should be instead.",
    input_schema: { type: "object", properties: { codeRequestId: { type: "integer" }, feedback: { type: "string" } }, required: ["codeRequestId", "feedback"], additionalProperties: false },
  },
  {
    name: "answer_build_question",
    description: "Pass the teacher's answer to a question the automatic build asked (it appears in the chat as \"❓ שאלה מהבנייה … (בקשה #N)\"). codeRequestId: N. answer: her answer in Hebrew, complete and self-contained — the build sees only this text and the original request, not the chat. The build then continues by itself.",
    input_schema: { type: "object", properties: { codeRequestId: { type: "integer" }, answer: { type: "string" } }, required: ["codeRequestId", "answer"], additionalProperties: false },
  },
  {
    name: "list_units",
    description: "All units of the year in curriculum order with: ref, title, position, taskId (null = not published yet), assigned count, how many students completed, whether review/discussion/study were done, due date. Use before anything that touches a unit.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_unit",
    description: "The full current text of one unit as students see it (after the teacher's edits): title, subtitle, reading intro, review deck points, discussion question + teacher note, every section with its blocks (questions have key/label/prompt/helper/fields, and `verses` — the verses pinned beside the question; a field may carry its own `verses`). Always call this before proposing a text edit, and quote the current text in the proposal.",
    input_schema: { type: "object", properties: { ref: { type: "string", description: "the unit's content ref, e.g. nedava-1" } }, required: ["ref"], additionalProperties: false },
  },
  {
    name: "list_students",
    description: "Every account: id, name, email, role, state (approved / pending / blocked), last seen, whether they have any work.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tasks",
    description: "Published tasks (taskId, ref, title, due date, assigned/submitted/graded counts).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "class_progress",
    description: "Per-student status on one published task: status (not_started / in_progress / submitted / graded / overdue), progress %, work minutes, score.",
    input_schema: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"], additionalProperties: false },
  },
  {
    name: "get_lesson_plan",
    description: "Today's lesson plan (blocks and which is running) — read only.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_code_requests",
    description: "Requests for changes to the site's code that were sent to the developer pipeline, with their status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_exams",
    description: "The teacher's exams (teacher-only, never shown to students): examId, title, date, status, total points, question count, and the state of its student preparation page (draft / published) with how many students started or finished it.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_exam",
    description: "One exam in full — every part (sectionKey) and question (questionId, number, text, points, answer key, writing lines) — and its preparation page (map, terms, practice items with itemId/kind/options/correct/explain, argument). Always call before edit_exam or edit_exam_prep.",
    input_schema: { type: "object", properties: { examId: { type: "integer" } }, required: ["examId"], additionalProperties: false },
  },
  {
    name: "get_class_slide",
    description: "The class rules slide as it is now (/dashboard/slide): title, the three blocks task / rules / done with heading and lines, and the closing line (footer). Always call before edit_class_slide.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_amana",
    description: "The class charter (אמנת הכיתה, /amana for students, /dashboard/amana for the teacher) as it is now: every clause with clauseId, number (position), text, verseQuote, verseSource, unitRef, status (draft / discussion / presented / approved), teacherNote, adminNotes (notes from the meeting with the management), clauseDate, proposedBy; and how many are approved. Always call before amana_clause.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_amana_proposals",
    description: "What the students proposed for the charter: their answers to the worksheet questions labelled \"מהפסוק לבית הספר · אמנת הכיתה\", per unit, with the student's name and userId, questionKey, the proposed clause, 👍 votes, and whether it is shown to the class (shown) and with the name (showName). ref = one unit; without ref = every unit that has a charter question.",
    input_schema: { type: "object", properties: { ref: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "skills_report",
    description: "Skills report (/dashboard/skills): per student and skill group (הבנת הנקרא, הבנת הנושא והעיקר, טעמי המקרא, התמצאות בתנ״ך, שפה ומילה מנחה, טיעון, אחר) the mean of the lenient answer checks (0–100) with the number of answers it rests on, plus submitted/due tasks, average work minutes per submission, empty submissions, strongest and weakest skill, and the class mean per skill. Cells with fewer than 3 answers are marked lowData. Optional filters: refs (unit content refs, from list_units), from / to (YYYY-MM-DD, task due date).",
    input_schema: {
      type: "object",
      properties: {
        refs: { type: "array", items: { type: "string" } },
        from: { type: "string" },
        to: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  // ---- write (proposals) ----
  {
    name: "edit_exam",
    description: "Edit a teacher-only exam: head fields (title, subtitle, instructions — the line at the top, durationMin, examDate YYYY-MM-DD), part titles/intros, and question operations in order — update (text / answer key / points / lines), add (to a part, at a 1-based position), delete, move (to a position, optionally into another part). status 'ready' marks the answer key as checked and approved, 'draft' returns it to draft; students never see the exam either way.",
    input_schema: {
      type: "object",
      properties: {
        examId: { type: "integer" },
        title: { type: "string" },
        subtitle: { type: "string" },
        instructions: { type: "string" },
        durationMin: { type: "integer" },
        examDate: { type: "string", description: "YYYY-MM-DD" },
        status: { type: "string", enum: ["draft", "ready"] },
        sections: { type: "object", description: "sectionKey -> {title?, intro?}", additionalProperties: { type: "object", properties: { title: { type: "string" }, intro: { type: "string" } }, additionalProperties: false } },
        ops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["update", "add", "delete", "move"] },
              questionId: { type: "string" },
              sectionKey: { type: "string", description: "add: the part; move: the target part (optional)" },
              position: { type: "integer", description: "add / move: 1-based place within the part" },
              text: { type: "string" },
              answer: { type: "string" },
              points: { type: "integer" },
              lines: { type: "integer", description: "answer lines in the student print" },
            },
            required: ["op"],
            additionalProperties: false,
          },
        },
      },
      required: ["examId"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_exam_prep",
    description: "Edit the student preparation page of an exam: title, intro, the chapter map (full replacement list), the terms list (full replacement), the argument intro and which units' discussion questions are offered (argumentRefs), and practice item operations (update / add / delete / move). publish=true shows the page to students (on /tasks with a countdown, and /exams); publish=false hides it again. Never put exam questions on the prep page.",
    input_schema: {
      type: "object",
      properties: {
        examId: { type: "integer" },
        title: { type: "string" },
        intro: { type: "string" },
        map: { type: "array", items: { type: "object", properties: { title: { type: "string" }, verses: { type: "string" }, summary: { type: "string" } }, required: ["title", "verses", "summary"], additionalProperties: false } },
        terms: { type: "array", items: { type: "object", properties: { term: { type: "string" }, verses: { type: "string" }, note: { type: "string" } }, required: ["term", "verses", "note"], additionalProperties: false } },
        argumentIntro: { type: "string" },
        argumentRefs: { type: "array", items: { type: "string" } },
        practiceOps: { type: "array", items: PREP_ITEM_SCHEMA },
        publish: { type: "boolean" },
      },
      required: ["examId"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_unit_texts",
    description: "Change texts of a unit in place: title/subtitle/readingIntro, question prompts (by question key), hide or unhide questions, add a teacher question to a section, section titles/minutes, intro/source/case texts (by block key), and the verses pinned next to a question or to one of its fields (`verses`, shown to students in a box beside the question). Only pass what changes. Each call is ONE proposal the teacher confirms.",
    input_schema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        readingIntro: { type: "string" },
        prompts: { type: "object", description: "question key -> new prompt text", additionalProperties: { type: "string" } },
        hide: { type: "array", items: { type: "string" }, description: "question keys to hide from students" },
        unhide: { type: "array", items: { type: "string" } },
        extra: { type: "array", items: { type: "object", properties: { sectionKey: { type: "string" }, prompt: { type: "string" }, label: { type: "string" } }, required: ["sectionKey", "prompt"], additionalProperties: false }, description: "new questions to append to a section" },
        sections: { type: "object", description: "section key -> {title?, minutes?}", additionalProperties: { type: "object", properties: { title: { type: "string" }, minutes: { type: "integer" } }, additionalProperties: false } },
        blocks: { type: "object", description: "block key -> {title?, body?, text?, caption?}", additionalProperties: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, text: { type: "string" }, caption: { type: "string" } }, additionalProperties: false } },
        verses: { type: "object", description: "\"question-key\" or \"question-key:field-key\" -> verses of the unit's main chapter in Hebrew numerals, e.g. \"ט״ז–כ׳\" or \"ד׳, כ״ג–כ״ד, ל״ב\"; \"\" removes the pinned verses (the question then shows the verses its wording names, automatically); \"none\" shows no verses box at all, even when the wording names verses", additionalProperties: { type: "string" } },
      },
      required: ["ref"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_review",
    description: "Replace a unit's review deck: 2-4 short points (one slide each, in verse order) and the one-line skill.",
    input_schema: { type: "object", properties: { ref: { type: "string" }, points: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 }, skill: { type: "string" } }, required: ["ref", "points"], additionalProperties: false },
  },
  {
    name: "edit_discussion",
    description: "Replace a unit's class discussion question (the last deck slide and the debate board) and the teacher-only note on what each side leans on.",
    input_schema: { type: "object", properties: { ref: { type: "string" }, question: { type: "string" }, teacherNote: { type: "string" } }, required: ["ref", "question"], additionalProperties: false },
  },
  {
    name: "reset_unit_edits",
    description: "Return a unit's texts to the original (file) version for one area: worksheet (question edits), unit (titles, intros), discussion, review, or all.",
    input_schema: { type: "object", properties: { ref: { type: "string" }, area: { type: "string", enum: ["worksheet", "unit", "discussion", "review", "all"] } }, required: ["ref", "area"], additionalProperties: false },
  },
  {
    name: "publish_unit",
    description: "Give a unit to the whole class (creates the task, or re-assigns a cancelled one) with a due date and time (Israel).",
    input_schema: { type: "object", properties: { ref: { type: "string" }, dueDate: { type: "string", description: "YYYY-MM-DD" }, dueTime: { type: "string", description: "HH:MM, default 23:59" } }, required: ["ref", "dueDate"], additionalProperties: false },
  },
  {
    name: "set_due_date",
    description: "Change the due date/time of a published task.",
    input_schema: { type: "object", properties: { taskId: { type: "integer" }, dueDate: { type: "string" }, dueTime: { type: "string" } }, required: ["taskId", "dueDate"], additionalProperties: false },
  },
  {
    name: "cancel_task",
    description: "Take a published task away from the class (it disappears from their lists; work is kept and it can be republished).",
    input_schema: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"], additionalProperties: false },
  },
  {
    name: "republish_task",
    description: "Return a cancelled task to the class.",
    input_schema: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"], additionalProperties: false },
  },
  {
    name: "mark_unit",
    description: "Mark on the journey that a unit's review / discussion / study was done (or not) — her word is final.",
    input_schema: { type: "object", properties: { taskId: { type: "integer" }, kind: { type: "string", enum: ["review", "discussion", "study"] }, done: { type: "boolean" } }, required: ["taskId", "kind", "done"], additionalProperties: false },
  },
  {
    name: "mark_done_up_to",
    description: "Mark every published unit up to and including this task as fully taught (review, discussion, study).",
    input_schema: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"], additionalProperties: false },
  },
  {
    name: "account_action",
    description: "Approve a pending account, block / unblock, mark an account as a teacher or back as a student, pre-approve an email that has not signed in yet, or merge two accounts of the same student (merge: userId = the account merged away, keepUserId = the account that stays; all its work moves to keepUserId — a task worked in both keeps the more advanced version, the other is archived; the merged account leaves every list and signing in with its email lands in the kept account), or rename an account (rename: userId + name = the student's full Hebrew display name; the teacher's name wins over the student's own and is never overwritten at the next sign-in; it shows everywhere on the site). Merge cannot be undone — check list_students first and use it only when the teacher clearly named which account stays.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["approve", "block", "unblock", "make_teacher", "make_student", "pre_approve_email", "merge", "rename"] },
        userId: { type: "integer" },
        keepUserId: { type: "integer", description: "merge only: the account that stays" },
        email: { type: "string" },
        name: { type: "string", description: "rename only: the new full display name, in Hebrew" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "send_message",
    description: "Send a message from the teacher: to the whole class (group chat) or to one student (personal chat). Write the message text exactly as it should be sent, in Hebrew.",
    input_schema: { type: "object", properties: { to: { type: "string", enum: ["class", "student"] }, userId: { type: "integer" }, text: { type: "string" } }, required: ["to", "text"], additionalProperties: false },
  },
  {
    name: "edit_class_slide",
    description: "Change the class rules slide (/dashboard/slide, projected at the start of a lesson, teacher only): the main title, the three blocks (task = 📝 the lesson's task, rules = 📏 the rules, done = 🏠 'finished?') — each a heading and its full list of lines (replaces the block's lines) — and the small closing line (footer). Only pass what changes. Call get_class_slide first.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        blocks: {
          type: "object",
          properties: Object.fromEntries(
            ["task", "rules", "done"].map((k) => [k, { type: "object", properties: { heading: { type: "string" }, lines: { type: "array", items: { type: "string" }, maxItems: 10 } }, additionalProperties: false }])
          ),
          additionalProperties: false,
        },
        footer: { type: "string", description: "\"\" removes the closing line" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "amana_clause",
    description: "Change the class charter (אמנת הכיתה). op=add: a new clause (text required; position = 1-based place, default at the end). op=edit: change fields of clauseId (only pass what changes — e.g. status alone to move it to \"presented\" / \"approved\", or adminNotes after the meeting with the management). op=delete: remove clauseId. op=move: put clauseId at position. Clause wording is the teacher's: write exactly what she asked, one or two sentences. status: draft = טיוטה, discussion = בדיון בכיתה, presented = הוצג להנהלה, approved = אושר. A clause added while the projector board is open is typed onto the screen. Call get_amana first.",
    input_schema: {
      type: "object",
      properties: {
        op: { type: "string", enum: ["add", "edit", "delete", "move"] },
        clauseId: { type: "integer" },
        position: { type: "integer" },
        text: { type: "string" },
        verseQuote: { type: "string", description: "a short quote of the grounding verse, with nikud when known" },
        verseSource: { type: "string", description: "e.g. ויקרא ה׳, כ״ג" },
        unitRef: { type: "string", description: "the unit (task ref) the clause was born in, e.g. nedava-3; \"\" = none" },
        status: { type: "string", enum: ["draft", "discussion", "presented", "approved"] },
        teacherNote: { type: "string", description: "optional note shown to students under the clause" },
        adminNotes: { type: "string", description: "notes from the meeting with the school management (teacher only)" },
        clauseDate: { type: "string", description: "YYYY-MM-DD" },
        proposedBy: { type: "string", description: "optional student names shown as 'הוצע על ידי'" },
      },
      required: ["op"],
      additionalProperties: false,
    },
  },
  {
    name: "amana_proposal",
    description: "Show a student's charter proposal to the class on /amana (shown) — nameless unless showName is true — or hide it again. ref, userId and questionKey come from get_amana_proposals.",
    input_schema: {
      type: "object",
      properties: { ref: { type: "string" }, userId: { type: "integer" }, questionKey: { type: "string" }, shown: { type: "boolean" }, showName: { type: "boolean" } },
      required: ["ref", "userId", "questionKey"],
      additionalProperties: false,
    },
  },
  {
    name: "undo_change",
    description: "Revert a change made earlier in this chat (its actionId was returned when it ran). Without actionId: the most recent revertible change. Use when the teacher asks to cancel / undo / put back.",
    input_schema: { type: "object", properties: { actionId: { type: "integer" } }, additionalProperties: false },
  },
  {
    name: "request_code_change",
    description: "For anything that needs a change to the site itself (a new button, screen, behaviour, design, a feature that no other tool covers): write a precise request for the developer pipeline. title: short Hebrew title. body: full Hebrew spec — where in the site, what exactly should change, why, what students vs. the teacher should see. The pipeline implements it, builds it and publishes it to the site by itself; the teacher sees the status in the chat.",
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, size: { type: "string", enum: ["small", "large"], description: "small (default): a focused change — a button, a field, a print view, a fix, a small screen. large: a new feature spanning several screens or data model changes. Large is built with a stronger, twice-as-expensive model." }, targets: { type: "array", items: { type: "string", enum: ["this", "binat-hatorah"] }, description: "Where to send it: \"this\" = this site (default); \"binat-hatorah\" = the sister site בינת התורה. Both when the teacher wants it in both sites." } }, required: ["title", "body"], additionalProperties: false },
  },
];

const KIND_HE: Record<string, string> = { review: "חזרה", discussion: "דיון", study: "לימוד" };

// ------------------------------------------------------------- exams ----
function examPatchOf(input: Record<string, unknown>): ExamPatch {
  const patch: ExamPatch = {};
  if (typeof input.title === "string") patch.title = str(input.title, 200);
  if (typeof input.subtitle === "string") patch.subtitle = str(input.subtitle, 300);
  if (typeof input.instructions === "string") patch.instructions = str(input.instructions, 3000);
  if (input.durationMin != null) patch.durationMin = Number(input.durationMin);
  if (typeof input.examDate === "string") patch.examDate = str(input.examDate, 10);
  if (input.sections && typeof input.sections === "object") patch.sections = input.sections as ExamPatch["sections"];
  if (Array.isArray(input.ops)) patch.ops = input.ops as ExamPatch["ops"];
  return patch;
}

type Change = { what: string; before: string | null; after: string | null };

// the before/after card of an exam edit, question by question
function diffExam(before: ExamDoc, after: ExamDoc): Change[] {
  const out: Change[] = [];
  const head: [keyof ExamDoc, string][] = [["title", "כותרת"], ["subtitle", "כותרת משנה"], ["instructions", "הנחיה בראש המבחן"], ["durationMin", "משך (דקות)"], ["examDate", "תאריך"]];
  for (const [k, label] of head) if (String(before[k] ?? "") !== String(after[k] ?? "")) out.push({ what: label, before: before[k] != null ? String(before[k]) : null, after: after[k] != null ? String(after[k]) : null });
  for (const s of after.sections) {
    const b = before.sections.find((x) => x.key === s.key);
    if (b && b.title !== s.title) out.push({ what: "כותרת חלק", before: b.title, after: s.title });
    if (b && b.intro !== s.intro) out.push({ what: `הוראה ל${s.title}`, before: b.intro, after: s.intro });
  }
  const oldQ = new Map(before.sections.flatMap((s) => s.questions.map((q) => [q.id, { q, s: s.key }] as const)));
  const newQ = new Map(after.sections.flatMap((s) => s.questions.map((q) => [q.id, { q, s: s.key }] as const)));
  const oldN = questionNumbers(before);
  const newN = questionNumbers(after);
  for (const [id, { q, s }] of newQ) {
    const o = oldQ.get(id);
    const n = newN.get(id);
    if (!o) {
      out.push({ what: `שאלה חדשה (${n}) · ${q.points} נק׳`, before: null, after: q.text });
      continue;
    }
    if (o.q.text !== q.text) out.push({ what: `שאלה ${n} — נוסח`, before: o.q.text, after: q.text });
    if (o.q.answer !== q.answer) out.push({ what: `שאלה ${n} — מחוון`, before: o.q.answer, after: q.answer });
    if (o.q.points !== q.points) out.push({ what: `שאלה ${n} — ניקוד`, before: String(o.q.points), after: String(q.points) });
    if ((o.q.lines ?? null) !== (q.lines ?? null)) out.push({ what: `שאלה ${n} — שורות לכתיבה`, before: o.q.lines != null ? String(o.q.lines) : "ברירת מחדל", after: q.lines != null ? String(q.lines) : "ברירת מחדל" });
    if (oldN.get(id) !== n || o.s !== s) out.push({ what: "סדר", before: `שאלה ${oldN.get(id)}`, after: `שאלה ${n}` });
  }
  for (const [id, { q }] of oldQ) if (!newQ.has(id)) out.push({ what: `מחיקת שאלה ${oldN.get(id)}`, before: q.text, after: null });
  if (totalPoints(before) !== totalPoints(after)) out.push({ what: "סה״כ נקודות", before: String(totalPoints(before)), after: String(totalPoints(after)) });
  return out;
}

function diffPrep(before: PrepDoc, after: PrepDoc): Change[] {
  const out: Change[] = [];
  if (before.title !== after.title) out.push({ what: "כותרת", before: before.title, after: after.title });
  if (before.intro !== after.intro) out.push({ what: "פתיח", before: before.intro, after: after.intro });
  const mapText = (d: PrepDoc) => d.map.map((m) => `${m.title} (${m.verses}): ${m.summary}`).join("\n");
  if (mapText(before) !== mapText(after)) out.push({ what: "מפת הפרק", before: mapText(before), after: mapText(after) });
  const termsText = (d: PrepDoc) => d.terms.map((t) => `${t.term} (${t.verses})${t.note ? ` — ${t.note}` : ""}`).join("\n");
  if (termsText(before) !== termsText(after)) out.push({ what: "ביטויים", before: termsText(before), after: termsText(after) });
  if (before.argument.intro !== after.argument.intro) out.push({ what: "הוראה לתרגול הטיעון", before: before.argument.intro, after: after.argument.intro });
  if (before.argument.refs.join() !== after.argument.refs.join()) out.push({ what: "שאלות הדיון לטיעון", before: before.argument.refs.join(", "), after: after.argument.refs.join(", ") });
  const oldI = new Map(before.practice.map((q, i) => [q.id, { q, i }] as const));
  after.practice.forEach((q, i) => {
    const o = oldI.get(q.id);
    const show = (x: typeof q) => `${x.text}${x.options.length ? `\nאפשרויות: ${x.options.join(" / ")}` : ""}${x.correct.length ? `\nנכון: ${x.correct.join(" / ")}` : ""}${x.verseNum ? `\nפסוק ${x.verseNum}` : ""}${x.explain ? `\nהסבר: ${x.explain}` : ""}`;
    if (!o) out.push({ what: `שאלת תרגול חדשה (${i + 1})`, before: null, after: show(q) });
    else if (JSON.stringify(o.q) !== JSON.stringify(q)) out.push({ what: `שאלת תרגול ${i + 1}`, before: show(o.q), after: show(q) });
    else if (o.i !== i) out.push({ what: "סדר התרגול", before: `שאלה ${o.i + 1}`, after: `שאלה ${i + 1}` });
  });
  for (const q of before.practice) if (!after.practice.some((x) => x.id === q.id)) out.push({ what: "מחיקת שאלת תרגול", before: q.text, after: null });
  return out;
}

// --------------------------------------------------------- class slide ----
function diffSlide(before: SlideDoc, after: SlideDoc): Change[] {
  const out: Change[] = [];
  if (before.title !== after.title) out.push({ what: "כותרת ראשית", before: before.title, after: after.title });
  for (const k of SLIDE_BLOCK_KEYS) {
    const b = before.blocks[k];
    const a = after.blocks[k];
    if (b.heading !== a.heading) out.push({ what: `${SLIDE_BLOCK_ICON[k]} כותרת הבלוק`, before: b.heading, after: a.heading });
    if (b.lines.join("\n") !== a.lines.join("\n")) out.push({ what: `${SLIDE_BLOCK_ICON[k]} ${a.heading} — השורות`, before: b.lines.join("\n") || null, after: a.lines.join("\n") || null });
  }
  if (before.footer !== after.footer) out.push({ what: "שורת הסיום", before: before.footer || null, after: after.footer || null });
  return out;
}

// ------------------------------------------------------------- charter ----
const CLAUSE_FIELD_HE: Record<string, string> = {
  text: "נוסח",
  verseQuote: "הפסוק",
  verseSource: "המקור",
  unitRef: "יחידה",
  status: "סטטוס",
  teacherNote: "הערת המורה",
  adminNotes: "הערות מהפגישה עם ההנהלה",
  clauseDate: "תאריך",
  proposedBy: "הוצע על ידי",
};
function clauseFieldText(k: string, v: unknown): string | null {
  if (v == null || v === "") return null;
  if (k === "status") return CLAUSE_STATUS_META[v as Clause["status"]]?.label ?? String(v);
  return String(v);
}
function clauseInputOf(input: Record<string, unknown>): ClauseInput {
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(CLAUSE_FIELD_HE)) if (input[k] !== undefined) raw[k] = input[k];
  return cleanClauseInput(raw);
}
async function amanaProposal(input: Record<string, unknown>): Promise<{ summary: string; preview: unknown } | { error: string }> {
  const op = String(input.op);
  if (op === "add") {
    const c = clauseInputOf(input);
    if (!c.text) return { error: "text required" };
    const n = (await listClauses()).length;
    const changes: Change[] = [{ what: `סעיף חדש באמנה (${input.position ?? n + 1})`, before: null, after: c.text }];
    for (const [k, v] of Object.entries(c)) if (k !== "text" && clauseFieldText(k, v)) changes.push({ what: CLAUSE_FIELD_HE[k], before: null, after: clauseFieldText(k, v) });
    return { summary: `הוספת סעיף לאמנת הכיתה`, preview: { unit: "אמנת הכיתה", changes } };
  }
  const clause = await getClause(Number(input.clauseId));
  if (!clause) return { error: "clause not found — call get_amana for the clauseId" };
  if (op === "delete") return { summary: `מחיקת סעיף ${clause.position} מהאמנה`, preview: { unit: "אמנת הכיתה", changes: [{ what: `סעיף ${clause.position}`, before: clause.text, after: null }] } };
  if (op === "move") {
    const to = Number(input.position);
    if (!Number.isFinite(to)) return { error: "position required" };
    return { summary: `העברת סעיף ${clause.position} למקום ${to}`, preview: { unit: "אמנת הכיתה", changes: [{ what: "מקום הסעיף", before: String(clause.position), after: String(to) }] } };
  }
  if (op === "edit") {
    const patch = clauseInputOf(input);
    const changes: Change[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const before = (clause as unknown as Record<string, unknown>)[k];
      if ((before ?? "") !== (v ?? "")) changes.push({ what: `סעיף ${clause.position} — ${CLAUSE_FIELD_HE[k]}`, before: clauseFieldText(k, before), after: clauseFieldText(k, v) });
    }
    if (!changes.length) return { error: "nothing to change" };
    return { summary: `עריכת סעיף ${clause.position} באמנה (${changes.length} שינויים)`, preview: { unit: "אמנת הכיתה", changes } };
  }
  return { error: `unknown op ${op} (add / edit / delete / move)` };
}

// ------------------------------------------------------- read executors ----
async function runReadTool(name: string, input: Record<string, unknown>, userId: number): Promise<unknown> {
  switch (name) {
    case "list_units": {
      const units = await unitsOverview();
      const tasks = await allTasksWithStats();
      const due = new Map(tasks.map((t) => [t.id, t.dueAt]));
      return units.map((u) => ({
        ref: u.ref,
        title: u.title,
        position: u.position,
        taskId: u.taskId,
        assigned: u.assigned,
        complete: u.complete,
        reviewed: u.reviewed > 0 && !u.off.includes("review"),
        discussed: u.discussed > 0 && !u.off.includes("discussion"),
        studied: u.studied > 0 && !u.off.includes("study"),
        dueAt: u.taskId != null && due.get(u.taskId) ? formatHebDateTime(due.get(u.taskId)!) : null,
      }));
    }
    case "get_unit":
      return (await unitSnapshot(str(input.ref, 80))) ?? { error: "unit not found" };
    case "list_students":
      return (await listAccounts()).map((a) => ({ id: a.id, name: a.fullName, email: a.email, role: a.role, state: a.state, lastSeen: a.lastSeenAt ? formatHebDateTime(a.lastSeenAt) : null, hasWork: a.hasWork }));
    case "list_tasks":
      return (await allTasksWithStats()).map((t) => ({ taskId: t.id, ref: t.contentRef, title: t.title, dueAt: formatHebDateTime(t.dueAt), assigned: t.assigned, submitted: t.submitted, graded: t.graded }));
    case "class_progress": {
      const roster = await taskRoster(Number(input.taskId));
      return roster.map((r) => ({ userId: r.userId, name: r.fullName, status: r.status, progressPct: r.progressPct, workMinutes: Math.round(r.workSeconds / 60), score: r.score, submittedAt: r.submittedAt ? formatHebDateTime(r.submittedAt) : null }));
    }
    case "get_lesson_plan":
      return await getPlan();
    case "get_class_slide":
      return await getSlide();
    case "get_amana": {
      const clauses = await listClauses();
      return {
        approved: clauses.filter((c) => c.status === "approved").length,
        total: clauses.length,
        clauses: clauses.map((c) => ({ clauseId: c.id, ...c, id: undefined, statusLabel: CLAUSE_STATUS_META[c.status].label })),
      };
    }
    case "skills_report": {
      const date = (v: unknown, time: string) => {
        const s = str(v, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? israelLocalToUnix(s, time) : undefined;
      };
      const refs = Array.isArray(input.refs) ? input.refs.map((r) => str(r, 80)).filter(Boolean) : [];
      const rep = await skillsReport({ refs, from: date(input.from, "00:00"), to: date(input.to, "23:59") });
      const name = (k: string | null) => rep.groups.find((g) => g.key === k)?.title ?? null;
      return {
        tasks: rep.tasks.map((t) => ({ taskId: t.taskId, ref: t.ref, title: t.title })),
        uncheckedAnswers: rep.unchecked,
        classAverage: Object.fromEntries(rep.groups.map((g) => [g.title, rep.classCells[g.key].avg == null ? null : { avg: rep.classCells[g.key].avg, answers: rep.classCells[g.key].n }])),
        students: rep.students.map((s) => ({
          userId: s.userId,
          name: s.name,
          class: s.klass,
          skills: Object.fromEntries(rep.groups.filter((g) => s.cells[g.key].n > 0).map((g) => [g.title, { avg: s.cells[g.key].avg, answers: s.cells[g.key].n, lowData: s.cells[g.key].n < MIN_ANSWERS || undefined }])),
          submitted: `${s.submitted}/${s.due}`,
          avgWorkMinutes: s.avgMinutes,
          emptySubmissions: s.emptySubmissions,
          strongest: name(s.strongest),
          needsWork: name(s.weakest),
        })),
      };
    }
    case "get_amana_proposals": {
      const ref = typeof input.ref === "string" ? str(input.ref, 80) : "";
      const units = ref ? [await proposalsForUnit(ref)].filter(Boolean) : await proposalsOverview();
      if (!units.length) return ref ? { error: "unit not found" } : { units: [], note: "no unit has a charter question yet" };
      return units.map((u) => ({
        ref: u!.ref,
        title: u!.title,
        questions: u!.questions,
        proposals: u!.proposals.map((p) => ({ userId: p.userId, name: p.name, class: p.klass, questionKey: p.questionKey, text: p.text, parts: p.parts.length ? p.parts : undefined, votes: p.votes, shown: p.shown, showName: p.showName })),
      }));
    }
    case "list_code_requests":
      return (await listCodeRequests(userId)).map((c) => ({ id: c.id, title: c.title, status: c.status, round: c.round, fixWaiting: c.fixPending, issueUrl: c.issueUrl, prUrl: c.prUrl, previewUrl: c.previewUrl, note: c.note }));
    case "list_exams": {
      const exams = await listExams();
      return Promise.all(
        exams.map(async (e) => {
          const prep = await getPrepForExam(e.id);
          const progress = prep ? await prepClassProgress(prep) : null;
          return {
            examId: e.id,
            title: e.title,
            examDate: e.doc.examDate ?? null,
            status: EXAM_STATUS_LABEL[e.status],
            totalPoints: totalPoints(e.doc),
            questions: e.doc.sections.reduce((a, s) => a + s.questions.length, 0),
            page: `/dashboard/exams/${e.id}`,
            prep: prep ? { status: prep.status === "published" ? "published to students" : "draft, hidden from students", started: progress?.started ?? 0, completed: progress?.completed ?? 0, students: progress?.students.length ?? 0 } : null,
          };
        })
      );
    }
    case "get_exam": {
      const exam = await getExam(Number(input.examId));
      if (!exam) return { error: "exam not found" };
      const nums = questionNumbers(exam.doc);
      const prep = await getPrepForExam(exam.id);
      return {
        examId: exam.id,
        status: EXAM_STATUS_LABEL[exam.status],
        title: exam.doc.title,
        subtitle: exam.doc.subtitle,
        instructions: exam.doc.instructions,
        durationMin: exam.doc.durationMin,
        examDate: exam.doc.examDate ?? null,
        totalPoints: totalPoints(exam.doc),
        sections: exam.doc.sections.map((s) => ({
          sectionKey: s.key,
          title: s.title,
          intro: s.intro,
          questions: s.questions.map((q) => ({ questionId: q.id, number: nums.get(q.id), text: q.text, points: q.points, answer: q.answer, lines: q.lines ?? null, verseNum: q.verseNum ?? null })),
        })),
        prep: prep ? { status: prep.status, doc: prep.doc } : null,
      };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

// ---------------------------------------------------- proposal builders ----
// A proposal = a Hebrew summary + a preview (before/after) the card shows.
async function buildProposal(name: string, input: Record<string, unknown>): Promise<{ summary: string; preview: unknown } | { error: string }> {
  switch (name) {
    case "edit_unit_texts": {
      const ref = str(input.ref, 80);
      const snap = await unitSnapshot(ref);
      if (!snap) return { error: "unit not found" };
      const changes: { what: string; before: string | null; after: string | null }[] = [];
      const findQ = (key: string) => {
        for (const s of snap.sections) for (const b of s.blocks) if (b.key === key) return b as Record<string, unknown>;
        return null;
      };
      if (typeof input.title === "string") changes.push({ what: "כותרת היחידה", before: snap.title, after: str(input.title, 200) });
      if (typeof input.subtitle === "string") changes.push({ what: "תת-כותרת", before: snap.subtitle, after: str(input.subtitle, 300) });
      if (typeof input.readingIntro === "string") changes.push({ what: "שורת הפתיחה מעל הפסוקים", before: snap.readingIntro, after: str(input.readingIntro, 600) });
      for (const [k, v] of Object.entries((input.prompts as Record<string, string>) ?? {})) {
        const q = findQ(k);
        changes.push({ what: `שאלה ${k}${q ? ` (${q.label})` : ""}`, before: q ? String(q.prompt ?? "") : "(לא נמצאה — תיווצר כתיקון)", after: str(v, 2000) });
      }
      for (const k of (input.hide as string[]) ?? []) {
        const q = findQ(k);
        changes.push({ what: `להסתיר שאלה ${k}`, before: q ? String(q.prompt ?? "").slice(0, 120) : "(לא נמצאה)", after: "מוסתרת מהתלמידים" });
      }
      for (const k of (input.unhide as string[]) ?? []) changes.push({ what: `להחזיר שאלה ${k}`, before: "מוסתרת", after: "מוצגת" });
      for (const e of (input.extra as { sectionKey: string; prompt: string; label?: string }[]) ?? []) changes.push({ what: `שאלה חדשה בתת-המשימה ${e.sectionKey}`, before: null, after: str(e.prompt, 2000) });
      for (const [k, v] of Object.entries((input.sections as Record<string, { title?: string; minutes?: number }>) ?? {})) {
        const s = snap.sections.find((x) => x.key === k);
        if (v.title) changes.push({ what: `כותרת תת-המשימה ${k}`, before: s?.title ?? null, after: str(v.title, 200) });
        if (v.minutes) changes.push({ what: `דקות לתת-המשימה ${k}`, before: s?.minutes != null ? String(s.minutes) : null, after: String(v.minutes) });
      }
      for (const [k, v] of Object.entries((input.blocks as Record<string, Record<string, string>>) ?? {})) {
        const b = findQ(k);
        for (const [f, t] of Object.entries(v)) changes.push({ what: `${k} · ${f}`, before: b ? String((b as Record<string, unknown>)[f] ?? "") : null, after: str(t, 4000) });
      }
      const max = chapterLength(TASK_REGISTRY[ref].mainPassage.verses);
      for (const [k, v] of Object.entries((input.verses as Record<string, string>) ?? {})) {
        const [qKey, fKey] = k.split(":");
        const q = findQ(qKey);
        if (!q || q.type !== "question") return { error: `no question with key ${qKey}` };
        const fields = (q.fields as { key: string; label: string; verses?: string }[] | null) ?? [];
        const field = fKey ? fields.find((f) => f.key === fKey) : null;
        if (fKey && !field) return { error: `question ${qKey} has no field ${fKey}` };
        const parsed = parseVerseSpec(str(v, 300), max);
        if (parsed.error) return { error: `verses for ${k}: ${parsed.error}` };
        const before = fKey ? field?.verses : (q.verses as string | null);
        changes.push({ what: `פסוקים ל${fKey ? `שדה ״${field!.label}״` : `שאלה ${qKey} (${q.label})`}`, before: before === "none" ? "בלי תיבת פסוקים (כבויה)" : before || "בלי פסוקים", after: parsed.none ? "בלי תיבת פסוקים (כבויה)" : parsed.nums.length ? formatVerseNums(parsed.nums) : "בלי פסוקים (אוטומטי לפי הנוסח)" });
      }
      if (changes.length === 0) return { error: "nothing to change" };
      return { summary: `עריכת טקסטים ביחידה ״${snap.title}״ (${changes.length} שינויים)`, preview: { unit: snap.title, changes } };
    }
    case "edit_review": {
      const snap = await unitSnapshot(str(input.ref, 80));
      if (!snap) return { error: "unit not found" };
      const points = ((input.points as string[]) ?? []).map((p) => str(p, 300)).filter(Boolean);
      return { summary: `מצגת החזרה של ״${snap.title}״`, preview: { unit: snap.title, changes: [{ what: "נקודות החזרה", before: (snap.review?.points ?? []).join("\n"), after: points.join("\n") }, ...(typeof input.skill === "string" ? [{ what: "המיומנות", before: snap.review?.skill ?? null, after: str(input.skill, 200) }] : [])] } };
    }
    case "edit_discussion": {
      const snap = await unitSnapshot(str(input.ref, 80));
      if (!snap) return { error: "unit not found" };
      return { summary: `שאלת הדיון של ״${snap.title}״`, preview: { unit: snap.title, changes: [{ what: "שאלת הדיון", before: snap.discussion?.question ?? null, after: str(input.question, 800) }, ...(typeof input.teacherNote === "string" ? [{ what: "הערה למורה", before: snap.discussion?.teacherNote ?? null, after: str(input.teacherNote, 2000) }] : [])] } };
    }
    case "reset_unit_edits": {
      const snap = await unitSnapshot(str(input.ref, 80));
      if (!snap) return { error: "unit not found" };
      return { summary: `חזרה לנוסח המקורי ב״${snap.title}״ (${input.area === "all" ? "הכול" : input.area})`, preview: { unit: snap.title, changes: [{ what: "אזור", before: String(input.area), after: "הנוסח המקורי מהקובץ" }] } };
    }
    case "publish_unit": {
      const ref = str(input.ref, 80);
      const reg = TASK_REGISTRY[ref];
      if (!reg) return { error: "unit not found" };
      const dueDate = str(input.dueDate, 10);
      const dueTime = /^\d{2}:\d{2}$/.test(str(input.dueTime, 5)) ? str(input.dueTime, 5) : "23:59";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "dueDate must be YYYY-MM-DD" };
      return { summary: `להקצות לכל הכיתה: ״${reg.content.title}״ · הגשה עד ${formatHebDateTime(israelLocalToUnix(dueDate, dueTime))}`, preview: { changes: [{ what: "יחידה", before: null, after: reg.content.title }, { what: "הגשה עד", before: null, after: formatHebDateTime(israelLocalToUnix(dueDate, dueTime)) }] } };
    }
    case "set_due_date": {
      const task = await getTask(Number(input.taskId));
      if (!task) return { error: "task not found" };
      const dueDate = str(input.dueDate, 10);
      const dueTime = /^\d{2}:\d{2}$/.test(str(input.dueTime, 5)) ? str(input.dueTime, 5) : "23:59";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "dueDate must be YYYY-MM-DD" };
      return { summary: `תאריך הגשה חדש ל״${task.title}״`, preview: { changes: [{ what: "הגשה עד", before: formatHebDateTime(task.due_at), after: formatHebDateTime(israelLocalToUnix(dueDate, dueTime)) }] } };
    }
    case "cancel_task":
    case "republish_task": {
      const task = await getTask(Number(input.taskId));
      if (!task) return { error: "task not found" };
      return { summary: name === "cancel_task" ? `להוריד מהכיתה: ״${task.title}״` : `להחזיר לכיתה: ״${task.title}״`, preview: { changes: [{ what: "משימה", before: task.title, after: name === "cancel_task" ? "יורדת מרשימת המשימות של התלמידים (העבודה נשמרת)" : "חוזרת לרשימת המשימות" }] } };
    }
    case "mark_unit": {
      const task = await getTask(Number(input.taskId));
      if (!task) return { error: "task not found" };
      return { summary: `${input.done ? "לסמן" : "לבטל סימון"} ${KIND_HE[String(input.kind)] ?? String(input.kind)} ב״${task.title}״`, preview: { changes: [{ what: KIND_HE[String(input.kind)] ?? String(input.kind), before: input.done ? "לא נעשה" : "נעשה ✓", after: input.done ? "נעשה ✓" : "לא נעשה" }] } };
    }
    case "mark_done_up_to": {
      const task = await getTask(Number(input.taskId));
      if (!task) return { error: "task not found" };
      return { summary: `לסמן שהכול עד ״${task.title}״ כבר נלמד (חזרה, דיון, לימוד)`, preview: { changes: [{ what: "המסע", before: null, after: `כל היחידות עד ״${task.title}״ ועד בכלל מסומנות כנעשו` }] } };
    }
    case "account_action": {
      const action = str(input.action, 30);
      if (action === "pre_approve_email") {
        const email = str(input.email, 200).toLowerCase();
        if (!email.includes("@")) return { error: "email required" };
        return { summary: `לאשר מראש את ${email}`, preview: { changes: [{ what: "חשבון", before: "עוד לא נכנס", after: `${email} ייכנס בלי המתנה לאישור` }] } };
      }
      if (action === "merge") {
        const plan = await planMerge(Number(input.keepUserId), Number(input.userId));
        if ("error" in plan) return { error: plan.error };
        return {
          summary: `איחוד ${plan.merged.email} לתוך ${plan.keep.fullName ?? plan.keep.email} (${plan.keep.email})`,
          preview: { changes: plan.lines.map((l) => ({ what: "איחוד", before: null, after: l })) },
        };
      }
      const acc = (await listAccounts()).find((a) => a.id === Number(input.userId));
      if (!acc) return { error: "account not found" };
      if (action === "rename") {
        const name = str(input.name, 80).replace(/\s+/g, " ").trim();
        if (!name) return { error: "name required" };
        return { summary: `שינוי שם: ${acc.fullName ?? acc.email} ← ${name}`, preview: { changes: [{ what: `שם התצוגה (${acc.email})`, before: acc.fullName ?? "(בלי שם)", after: name }] } };
      }
      const label: Record<string, string> = { approve: "לאשר כניסה", block: "לחסום", unblock: "לבטל חסימה", make_teacher: "לסמן כמורה", make_student: "להחזיר לתלמיד/ה" };
      if (!label[action]) return { error: "unknown action" };
      return { summary: `${label[action]}: ${acc.fullName ?? acc.email}`, preview: { changes: [{ what: acc.fullName ?? acc.email, before: `${acc.role === "teacher" ? "מורה" : "תלמיד/ה"} · ${acc.state}`, after: label[action] }] } };
    }
    case "send_message": {
      const text = str(input.text, 4000);
      if (!text) return { error: "text required" };
      if (input.to === "student") {
        const acc = (await listAccounts()).find((a) => a.id === Number(input.userId));
        if (!acc) return { error: "student not found" };
        return { summary: `הודעה אישית ל${acc.fullName ?? acc.email}`, preview: { changes: [{ what: `אל: ${acc.fullName ?? acc.email}`, before: null, after: text }] } };
      }
      return { summary: "הודעה לכל הכיתה", preview: { changes: [{ what: "אל: כל הכיתה (צ׳אט קבוצתי)", before: null, after: text }] } };
    }
    case "edit_exam": {
      const exam = await getExam(Number(input.examId));
      if (!exam) return { error: "exam not found" };
      let next: ExamDoc;
      try {
        next = applyExamPatch(exam.doc, examPatchOf(input));
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      const changes = diffExam(exam.doc, next);
      if (input.status === "ready" || input.status === "draft") {
        if (input.status !== exam.status) changes.push({ what: "סטטוס", before: EXAM_STATUS_LABEL[exam.status], after: EXAM_STATUS_LABEL[input.status] });
      }
      if (changes.length === 0) return { error: "nothing to change" };
      return { summary: `עריכת המבחן ״${exam.doc.title}״ (${changes.length} שינויים)`, preview: { unit: exam.doc.title, changes } };
    }
    case "edit_exam_prep": {
      const exam = await getExam(Number(input.examId));
      if (!exam) return { error: "exam not found" };
      const prep = await getPrepForExam(exam.id);
      if (!prep) return { error: "this exam has no preparation page yet — the teacher creates one on the exam page" };
      let next: PrepDoc;
      try {
        next = applyPrepPatch(prep.doc, input as PrepPatch);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      const changes = diffPrep(prep.doc, next);
      if (typeof input.publish === "boolean" && (input.publish ? "published" : "draft") !== prep.status) {
        changes.push({ what: "פרסום לתלמידים", before: prep.status === "published" ? "מפורסם" : "מוסתר", after: input.publish ? "מפורסם — מופיע במשימות עם ספירה לאחור" : "מוסתר מהתלמידים" });
      }
      if (changes.length === 0) return { error: "nothing to change" };
      return { summary: `דף ההכנה ״${prep.doc.title}״ (${changes.length} שינויים)`, preview: { unit: prep.doc.title, changes } };
    }
    case "edit_class_slide": {
      const current = await getSlide();
      const changes = diffSlide(current, cleanSlide(input, current));
      if (changes.length === 0) return { error: "nothing to change" };
      return { summary: `שקופית כללי השיעור (${changes.length} שינויים)`, preview: { unit: "שקופית כללי השיעור", changes } };
    }
    case "amana_clause":
      return amanaProposal(input);
    case "amana_proposal": {
      const ref = str(input.ref, 80);
      const unit = await proposalsForUnit(ref);
      if (!unit) return { error: "unit not found" };
      const p = unit.proposals.find((x) => x.userId === Number(input.userId) && x.questionKey === String(input.questionKey));
      if (!p) return { error: "proposal not found — call get_amana_proposals" };
      const changes: Change[] = [];
      if (typeof input.shown === "boolean" && input.shown !== p.shown) changes.push({ what: `ההצעה של ${p.name}`, before: p.shown ? "מוצגת לכיתה" : "מוסתרת", after: input.shown ? "מוצגת לכיתה" : "מוסתרת" });
      if (typeof input.showName === "boolean" && input.showName !== p.showName) changes.push({ what: "שם התלמיד/ה ליד ההצעה", before: p.showName ? "מוצג" : "בלי שם", after: input.showName ? "מוצג" : "בלי שם" });
      if (!changes.length) return { error: "nothing to change" };
      return { summary: `הצעה לאמנה: ${p.text.slice(0, 60)}`, preview: { unit: "אמנת הכיתה — הצעות", changes } };
    }
    case "revise_code_request": {
      const feedback = str(input.feedback, 20_000);
      if (!feedback) return { error: "feedback required" };
      const cr = (await db().execute({ sql: "SELECT title FROM code_requests WHERE id = ?", args: [Number(input.codeRequestId)] })).rows[0];
      if (!cr) return { error: "code request not found — use list_code_requests" };
      return { summary: `תיקון לבקשה: ${String(cr.title)}`, preview: { changes: [{ what: "התיקון שיישלח לבנייה", before: null, after: feedback }] } };
    }
    case "answer_build_question": {
      const answer = str(input.answer, 20_000);
      if (!answer) return { error: "answer required" };
      const cr = (await db().execute({ sql: "SELECT title, issue_number, question FROM code_requests WHERE id = ?", args: [Number(input.codeRequestId)] })).rows[0];
      if (!cr || cr.issue_number == null) return { error: "code request not found or not sent yet" };
      return { summary: `תשובה לשאלת הבנייה: ${String(cr.title)}`, preview: { changes: [{ what: "התשובה שתועבר לבנייה", before: (cr.question as string | null) ?? null, after: answer }] } };
    }
    case "request_code_change": {
      const title = str(input.title, 120);
      const body = str(input.body, CODE_REQUEST_BODY_MAX);
      if (!title || !body) return { error: "title and body required" };
      return { summary: `בקשת שינוי באתר: ${title}`, preview: { changes: [{ what: "הבקשה שתישלח לבנייה", before: null, after: `${title}\n\n${body}` }] } };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

// ------------------------------------------------------------ applying ----
export async function applyAction(actionId: number, userId: number): Promise<ActionRow> {
  await ensureChatTables();
  const r = await db().execute({ sql: "SELECT * FROM teacher_chat_actions WHERE id = ? AND user_id = ?", args: [actionId, userId] });
  const row = r.rows[0];
  if (!row) throw new Error("הפעולה לא נמצאה");
  if (String(row.status) !== "pending") return rowToAction(row as Record<string, unknown>);
  const tool = String(row.tool);
  const input = JSON.parse(String(row.input_json)) as Record<string, unknown>;
  let undo: unknown = null;
  let result: unknown = null;
  try {
    switch (tool) {
      case "edit_unit_texts": {
        const ref = str(input.ref, 80);
        const ov = await getOverrides(ref);
        undo = { worksheet: ov.worksheet ?? null, unit: ov.unit ?? null };
        const ws: WorksheetEdits = { ...EMPTY_EDITS, ...(ov.worksheet ?? {}), hidden: [...(ov.worksheet?.hidden ?? [])], prompts: { ...(ov.worksheet?.prompts ?? {}) }, extra: [...(ov.worksheet?.extra ?? [])] };
        if (input.verses && typeof input.verses === "object") {
          const max = chapterLength(TASK_REGISTRY[ref].mainPassage.verses);
          const verses = { ...(ws.verses ?? {}) };
          for (const [k, v] of Object.entries(input.verses as Record<string, string>)) {
            const spec = normalizeVerseSpec(str(v, 300), max);
            if (spec == null) throw new Error(`טווח פסוקים לא תקין: ${str(v, 60)}`);
            verses[str(k, 160)] = spec;
          }
          ws.verses = verses;
        }
        for (const [k, v] of Object.entries((input.prompts as Record<string, string>) ?? {})) ws.prompts[k] = str(v, 2000);
        for (const k of (input.hide as string[]) ?? []) if (!ws.hidden.includes(k)) ws.hidden.push(k);
        for (const k of (input.unhide as string[]) ?? []) ws.hidden = ws.hidden.filter((x) => x !== k);
        for (const e of (input.extra as { sectionKey: string; prompt: string; label?: string }[]) ?? []) ws.extra.push({ sectionKey: str(e.sectionKey, 60), key: `t${Date.now().toString(36)}${ws.extra.length}`, prompt: str(e.prompt, 2000), label: e.label ? str(e.label, 80) : undefined });
        const u: UnitEdits = { ...EMPTY_UNIT, ...(ov.unit ?? {}), sections: { ...(ov.unit?.sections ?? {}) }, blocks: { ...(ov.unit?.blocks ?? {}) } };
        if (typeof input.title === "string") u.title = str(input.title, 200);
        if (typeof input.subtitle === "string") u.subtitle = str(input.subtitle, 300);
        if (typeof input.readingIntro === "string") u.readingIntro = str(input.readingIntro, 600);
        for (const [k, v] of Object.entries((input.sections as Record<string, { title?: string; minutes?: number }>) ?? {})) u.sections[k] = { ...(u.sections[k] ?? {}), ...(v.title ? { title: str(v.title, 200) } : {}), ...(v.minutes ? { minutes: Number(v.minutes) } : {}) };
        for (const [k, v] of Object.entries((input.blocks as Record<string, Record<string, string>>) ?? {})) u.blocks[k] = { ...(u.blocks[k] ?? {}), ...Object.fromEntries(Object.entries(v).map(([f, t]) => [f, str(t, 4000)])) };
        await setOverride(ref, "worksheet", ws, userId);
        await setOverride(ref, "unit", u, userId);
        break;
      }
      case "edit_review": {
        const ref = str(input.ref, 80);
        const ov = await getOverrides(ref);
        undo = { review: ov.review ?? null };
        const reg = TASK_REGISTRY[ref];
        const current = (await effectiveContent(reg.content)).review;
        await setOverride(ref, "review", { points: ((input.points as string[]) ?? []).map((p) => str(p, 300)).filter(Boolean), skill: typeof input.skill === "string" ? str(input.skill, 200) : current?.skill ?? "" }, userId);
        break;
      }
      case "edit_discussion": {
        const ref = str(input.ref, 80);
        const ov = await getOverrides(ref);
        undo = { discussion: ov.discussion ?? null };
        const reg = TASK_REGISTRY[ref];
        const current = (await effectiveContent(reg.content)).discussion;
        await setOverride(ref, "discussion", { question: str(input.question, 800), teacherNote: typeof input.teacherNote === "string" ? str(input.teacherNote, 2000) : current?.teacherNote ?? "" }, userId);
        break;
      }
      case "reset_unit_edits": {
        const ref = str(input.ref, 80);
        const ov = await getOverrides(ref);
        const areas: EditableField[] = input.area === "all" ? ["worksheet", "unit", "discussion", "review"] : [input.area as EditableField];
        undo = Object.fromEntries(areas.map((a) => [a, (ov as Record<string, unknown>)[a] ?? null]));
        for (const a of areas) await clearOverride(ref, a);
        break;
      }
      case "publish_unit": {
        const dueTime = /^\d{2}:\d{2}$/.test(str(input.dueTime, 5)) ? str(input.dueTime, 5) : "23:59";
        const taskId = await publishUnit(str(input.ref, 80), israelLocalToUnix(str(input.dueDate, 10), dueTime), userId);
        undo = { cancelTaskId: taskId };
        result = { taskId };
        break;
      }
      case "set_due_date": {
        const task = await getTask(Number(input.taskId));
        if (!task) throw new Error("המשימה לא נמצאה");
        undo = { taskId: task.id, dueAt: task.due_at };
        const dueTime = /^\d{2}:\d{2}$/.test(str(input.dueTime, 5)) ? str(input.dueTime, 5) : "23:59";
        await updateTaskDueDate(task.id, israelLocalToUnix(str(input.dueDate, 10), dueTime));
        break;
      }
      case "cancel_task":
        await cancelTaskAssignment(Number(input.taskId));
        undo = { republishTaskId: Number(input.taskId) };
        break;
      case "republish_task":
        await republishTask(Number(input.taskId));
        undo = { cancelTaskId: Number(input.taskId) };
        break;
      case "mark_unit":
        await setUnitDone(Number(input.taskId), String(input.kind) as "review" | "discussion" | "study", Boolean(input.done));
        undo = { taskId: Number(input.taskId), kind: String(input.kind), done: !input.done };
        break;
      case "mark_done_up_to":
        await markDoneUpTo(Number(input.taskId));
        break;
      case "account_action": {
        const action = str(input.action, 30);
        const id = Number(input.userId);
        if (action === "approve") await approveUser(id);
        else if (action === "block") { await blockUser(id); undo = { unblock: id }; }
        else if (action === "unblock") { await unblockUser(id); undo = { block: id }; }
        else if (action === "make_teacher") { await makeTeacher(id); undo = { make_student: id }; }
        else if (action === "make_student") { await makeStudent(id); undo = { make_teacher: id }; }
        else if (action === "pre_approve_email") await preApproveEmail(str(input.email, 200).toLowerCase());
        else if (action === "rename") {
          const r = await renameUser(id, str(input.name, 80));
          if (!r.ok) throw new Error(r.error);
          undo = { rename: id, fullName: r.before.fullName, setAt: r.before.setAt };
        }
        else if (action === "merge") {
          const r = await mergeAccounts(Number(input.keepUserId), id, { by: userId });
          if (!r.ok) throw new Error(r.error);
          result = { merged: r.plan.lines };
        }
        break;
      }
      case "send_message": {
        const text = str(input.text, 4000);
        if (input.to === "student") await sendMessage(userId, Number(input.userId), text);
        else await sendGroupMessage(userId, text);
        break;
      }
      case "edit_exam": {
        const exam = await getExam(Number(input.examId));
        if (!exam) throw new Error("המבחן לא נמצא");
        undo = { examId: exam.id, doc: exam.doc, status: exam.status };
        const status = input.status === "ready" || input.status === "draft" ? input.status : exam.status;
        await saveExam(exam.id, applyExamPatch(exam.doc, examPatchOf(input)), status);
        result = { page: `/dashboard/exams/${exam.id}` };
        break;
      }
      case "edit_exam_prep": {
        const prep = await getPrepForExam(Number(input.examId));
        if (!prep) throw new Error("אין דף הכנה למבחן הזה");
        undo = { examId: prep.examId, prepDoc: prep.doc, prepStatus: prep.status };
        const status = typeof input.publish === "boolean" ? (input.publish ? "published" : "draft") : prep.status;
        await savePrep(prep.examId, applyPrepPatch(prep.doc, input as PrepPatch), status);
        result = { status };
        break;
      }
      case "edit_class_slide": {
        const current = await getSlide();
        undo = { slide: current };
        await saveSlide(cleanSlide(input, current), userId);
        result = { page: "/dashboard/slide" };
        break;
      }
      case "amana_clause": {
        const op = String(input.op);
        if (op === "add") {
          const pos = input.position != null ? Number(input.position) : undefined;
          const c = await addClause(clauseInputOf(input), userId, pos);
          undo = { deleteClauseId: c.id };
          result = { clauseId: c.id, position: c.position, page: "/amana" };
        } else {
          const clause = await getClause(Number(input.clauseId));
          if (!clause) throw new Error("הסעיף לא נמצא");
          if (op === "delete") {
            await deleteClause(clause.id);
            undo = { restoreClause: clause };
            result = { deleted: clause.position };
          } else if (op === "move") {
            await moveClause(clause.id, Number(input.position));
            undo = { clauseId: clause.id, position: clause.position };
            result = { position: (await getClause(clause.id))?.position };
          } else if (op === "edit") {
            const before: ClauseInput = {};
            const patch = clauseInputOf(input);
            for (const k of Object.keys(patch)) (before as Record<string, unknown>)[k] = (clause as unknown as Record<string, unknown>)[k] ?? "";
            await updateClause(clause.id, patch);
            undo = { clauseId: clause.id, before };
            result = { clauseId: clause.id, page: "/amana" };
          } else throw new Error("פעולה לא ידועה");
        }
        break;
      }
      case "amana_proposal": {
        const ref = str(input.ref, 80);
        const unit = await proposalsForUnit(ref);
        const p = unit?.proposals.find((x) => x.userId === Number(input.userId) && x.questionKey === String(input.questionKey));
        if (!p) throw new Error("ההצעה לא נמצאה");
        undo = { ref, userId: p.userId, questionKey: p.questionKey, shown: p.shown, showName: p.showName };
        const flags = await setProposalFlags(ref, p.userId, p.questionKey, {
          shown: typeof input.shown === "boolean" ? input.shown : undefined,
          showName: typeof input.showName === "boolean" ? input.showName : undefined,
        });
        result = { shown: flags.shown, showName: flags.showName, page: "/amana" };
        break;
      }
      case "revise_code_request": {
        const cr = await reviseCodeRequest(Number(input.codeRequestId), str(input.feedback, 20_000));
        const message =
          cr.issueNumber == null
            ? "הבקשה עוד לא יצאה לבנייה, אז התיקון צורף אליה והכול ייבנה יחד"
            : cr.status === "fix_queued"
              ? "התיקון נרשם על אותה בקשה וייצא לבנייה בעוד כשתי דקות (או מיד כשהבנייה שרצה עכשיו תסתיים). הערות נוספות שתכתבי עד אז ייכנסו לאותו סבב"
              : "הבקשה עדיין בבנייה; התיקון נרשם וייצא מיד כשהיא תעלה לאתר";
        result = { codeRequestId: cr.id, status: cr.status, message };
        break;
      }
      case "answer_build_question": {
        const id = Number(input.codeRequestId);
        const answer = str(input.answer, 20_000);
        const cr = (await db().execute({ sql: "SELECT issue_number, repo FROM code_requests WHERE id = ?", args: [id] })).rows[0];
        if (!cr || cr.issue_number == null) throw new Error("הבקשה לא נמצאה");
        if (!process.env.GITHUB_TOKEN) throw new Error("אין חיבור ל-GitHub");
        const repo = (cr.repo as string | null) ?? SITE.repo;
        await gh(`/repos/${repo}/issues/${Number(cr.issue_number)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `@claude\n\nתשובת המורה (מהצ׳אט באתר):\n\n${answer}\n\nיש להמשיך לבנות את הבקשה לפי התשובה הזאת, להריץ בנייה ולפתוח Pull Request.` }),
        });
        await db().execute({ sql: "UPDATE code_requests SET status = 'working', retried_at = ?, updated_at = ? WHERE id = ?", args: [now(), now(), id] });
        result = { codeRequestId: id, message: "התשובה הועברה לבנייה, והיא ממשיכה מעצמה" };
        break;
      }
      case "request_code_change": {
        const title = str(input.title, 120);
        const body = str(input.body, CODE_REQUEST_BODY_MAX);
        // targets: "this" (default) and/or sister sites — each gets its own request
        const raw = Array.isArray(input.targets) ? (input.targets as unknown[]).map(String) : ["this"];
        const targets = raw.filter((k) => k === "this" || SITE.sisters[k]);
        if (targets.length === 0) targets.push("this");
        const made: { site: string; codeRequestId: number; status: string; issueUrl: string | null; message: string }[] = [];
        for (const k of targets) {
          const size = input.size === "large" ? "large" : "small";
          const cr = await createCodeRequest(userId, title, body, k === "this" ? SITE.repo : SITE.sisters[k].repo, size);
          const message = cr.mergedInto ? `צורפה לבקשה שעוד ממתינה בתור (״${cr.title}״), כדי שהכול ייבנה יחד בבנייה אחת` : describeCodeRequest(cr);
          made.push({ site: k === "this" ? SITE.name : SITE.sisters[k].name, codeRequestId: cr.id, status: cr.status, issueUrl: cr.issueUrl, message });
        }
        const first = made[0];
        result = { codeRequestId: first.codeRequestId, status: first.status, issueUrl: first.issueUrl, message: first.message, requests: made };
        break;
      }
      default:
        throw new Error("כלי לא ידוע");
    }
  } catch (e) {
    await db().execute({ sql: "UPDATE teacher_chat_actions SET status = 'failed', result_json = ? WHERE id = ?", args: [compact({ error: e instanceof Error ? e.message : String(e) }), actionId] });
    const again = await db().execute({ sql: "SELECT * FROM teacher_chat_actions WHERE id = ?", args: [actionId] });
    return rowToAction(again.rows[0] as Record<string, unknown>);
  }
  await db().execute({
    sql: "UPDATE teacher_chat_actions SET status = 'applied', undo_json = ?, result_json = ?, applied_at = ? WHERE id = ?",
    args: [undo == null ? null : compact(undo), result == null ? null : compact(result), now(), actionId],
  });
  const again = await db().execute({ sql: "SELECT * FROM teacher_chat_actions WHERE id = ?", args: [actionId] });
  return rowToAction(again.rows[0] as Record<string, unknown>);
}

export async function dismissAction(actionId: number, userId: number) {
  await ensureChatTables();
  await db().execute({ sql: "UPDATE teacher_chat_actions SET status = 'dismissed' WHERE id = ? AND user_id = ? AND status = 'pending'", args: [actionId, userId] });
}

export async function undoAction(actionId: number, userId: number): Promise<ActionRow> {
  await ensureChatTables();
  const r = await db().execute({ sql: "SELECT * FROM teacher_chat_actions WHERE id = ? AND user_id = ?", args: [actionId, userId] });
  const row = r.rows[0];
  if (!row || String(row.status) !== "applied" || row.undo_json == null) throw new Error("אי אפשר לבטל את הפעולה הזאת");
  const tool = String(row.tool);
  const input = JSON.parse(String(row.input_json)) as Record<string, unknown>;
  const undo = JSON.parse(String(row.undo_json)) as Record<string, unknown>;
  const ref = str(input.ref, 80);
  const restore = async (field: EditableField, value: unknown) => {
    if (value == null) await clearOverride(ref, field);
    else await setOverride(ref, field, value, userId);
  };
  switch (tool) {
    case "edit_unit_texts":
      await restore("worksheet", undo.worksheet);
      await restore("unit", undo.unit);
      break;
    case "edit_review":
      await restore("review", undo.review);
      break;
    case "edit_discussion":
      await restore("discussion", undo.discussion);
      break;
    case "reset_unit_edits":
      for (const [f, v] of Object.entries(undo)) await restore(f as EditableField, v);
      break;
    case "publish_unit":
    case "republish_task":
      await cancelTaskAssignment(Number(undo.cancelTaskId));
      break;
    case "cancel_task":
      await republishTask(Number(undo.republishTaskId));
      break;
    case "set_due_date":
      await updateTaskDueDate(Number(undo.taskId), Number(undo.dueAt));
      break;
    case "mark_unit":
      await setUnitDone(Number(undo.taskId), String(undo.kind) as "review" | "discussion" | "study", Boolean(undo.done));
      break;
    case "account_action":
      if (undo.unblock) await unblockUser(Number(undo.unblock));
      else if (undo.block) await blockUser(Number(undo.block));
      else if (undo.make_student) await makeStudent(Number(undo.make_student));
      else if (undo.make_teacher) await makeTeacher(Number(undo.make_teacher));
      else if (undo.rename) await restoreUserName(Number(undo.rename), (undo.fullName as string | null) ?? null, undo.setAt != null ? Number(undo.setAt) : null);
      break;
    case "edit_exam":
      await saveExam(Number(undo.examId), undo.doc as ExamDoc, undo.status === "ready" ? "ready" : "draft");
      break;
    case "edit_exam_prep":
      await savePrep(Number(undo.examId), undo.prepDoc as PrepDoc, undo.prepStatus === "published" ? "published" : "draft");
      break;
    case "edit_class_slide":
      await saveSlide(cleanSlide(undo.slide), userId);
      break;
    case "amana_clause":
      if (undo.deleteClauseId != null) await deleteClause(Number(undo.deleteClauseId));
      else if (undo.restoreClause) await restoreClause(undo.restoreClause as Clause);
      else if (undo.before) await updateClause(Number(undo.clauseId), undo.before as ClauseInput);
      else if (undo.position != null) await moveClause(Number(undo.clauseId), Number(undo.position));
      break;
    case "amana_proposal":
      await setProposalFlags(String(undo.ref), Number(undo.userId), String(undo.questionKey), { shown: Boolean(undo.shown), showName: Boolean(undo.showName) });
      break;
    default:
      throw new Error("אי אפשר לבטל את הפעולה הזאת");
  }
  await db().execute({ sql: "UPDATE teacher_chat_actions SET status = 'undone' WHERE id = ?", args: [actionId] });
  const again = await db().execute({ sql: "SELECT * FROM teacher_chat_actions WHERE id = ?", args: [actionId] });
  return rowToAction(again.rows[0] as Record<string, unknown>);
}

// ------------------------------------------------------- code requests ----
// A request for a change in the site's code becomes a GitHub issue tagged for
// the Claude Code action, which implements it on a branch, opens a PR, and
// the repository's workflow builds and merges it when green. Without a
// GitHub token the request waits in the queue (status 'queued') and the
// page says so.
const gh = async (path: string, init?: RequestInit) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as unknown;
};

// a request body may be long (a teacher pastes a whole exam): GitHub takes
// 65,536 characters per issue; the rest of the issue is a short footer
const CODE_REQUEST_BODY_MAX = 60_000;

// what the teacher pasted in the chat since the last code request, word for
// word: the chat model need not (and, within its output limit, cannot)
// retype a long text into the request, so the build always gets the source
function pastedSinceLastRequest(messages: Anthropic.MessageParam[]): string[] {
  const out: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!Array.isArray(m.content)) continue;
    if (m.role === "assistant" && m.content.some((b) => b.type === "tool_use" && b.name === "request_code_change")) break;
    if (m.role !== "user") continue;
    for (const b of m.content) {
      if (b.type !== "text") continue;
      const t = b.text.replace(/^\[[^\]\n]*\]\n/, "").trim();
      if (t.length >= 1200) out.unshift(t);
    }
  }
  return out;
}

export async function createCodeRequest(userId: number, title: string, body: string, repo: string = SITE.repo, size: "small" | "large" = "small"): Promise<CodeRequestRow & { mergedInto?: boolean }> {
  await ensureChatTables();
  await refreshCodeRequests(userId);
  const t = now();
  // a request that has not left yet (waiting in the queue for this repo)
  // absorbs a new one: one build instead of two — Reut often sends an
  // addition while the first is still waiting
  const waiting = (
    await db().execute({
      sql: "SELECT id, title, body, size FROM code_requests WHERE user_id = ? AND COALESCE(repo, ?) = ? AND status = 'queued' AND issue_number IS NULL ORDER BY id DESC LIMIT 1",
      args: [userId, SITE.repo, repo],
    })
  ).rows[0];
  if (waiting && String(waiting.body).length + body.length < CODE_REQUEST_BODY_MAX) {
    const merged = `${String(waiting.body)}\n\n---\nתוספת מאותה מורה, לבנות יחד עם הבקשה שלמעלה: ${title}\n\n${body}`;
    const mergedSize = size === "large" || String(waiting.size ?? "") === "large" ? "large" : "small";
    await db().execute({
      sql: "UPDATE code_requests SET body = ?, size = ?, updated_at = ? WHERE id = ?",
      args: [merged, mergedSize, t, Number(waiting.id)],
    });
    const row = (await listCodeRequests(userId)).find((c) => c.id === Number(waiting.id))!;
    return { ...row, mergedInto: true };
  }
  // a request for a sister site is marked in its title so the teacher sees
  // where it went; the issue itself gets the plain title
  const sister = Object.values(SITE.sisters).find((s) => s.repo === repo);
  const shownTitle = sister ? `[${sister.name}] ${title}` : title;
  const ins = await db().execute({
    sql: "INSERT INTO code_requests (user_id, title, body, status, repo, size, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)",
    args: [userId, shownTitle, body, repo, size, t, t],
  });
  const id = Number(ins.lastInsertRowid);
  // one request at a time per repository: parallel branches on the same code
  // conflicted and the second could not be merged. A request made while
  // another is still being built waits in the queue and is sent by itself
  // the moment the previous one is merged or closed (see refreshCodeRequests).
  const inFlight = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM code_requests WHERE COALESCE(repo, ?) = ? AND status IN ('open','working','preview') AND COALESCE(retried_at, created_at) > CAST(strftime('%s','now') AS INTEGER) - 10800",
    args: [SITE.repo, repo],
  });
  if (Number(inFlight.rows[0]?.n ?? 0) > 0) {
    await db().execute({ sql: "UPDATE code_requests SET note = ?, updated_at = ? WHERE id = ?", args: [QUEUE_NOTE, now(), id] });
    return (await listCodeRequests(userId)).find((c) => c.id === id)!;
  }
  await openIssueFor(id);
  return (await listCodeRequests(userId)).find((c) => c.id === id)!;
}

// one line the model repeats to the teacher — never "passed to the developers"
export function describeCodeRequest(cr: CodeRequestRow): string {
  if (cr.status === "open" && cr.issueUrl) return `נשלחה לבנייה האוטומטית (${cr.issueUrl}); בדרך כלל עולה לאתר תוך 10–30 דקות`;
  if (cr.status === "queued" && cr.note === QUEUE_NOTE) return "נרשמה וממתינה בתור — בקשה קודמת עדיין בבנייה; תישלח מעצמה כשתסתיים";
  if (cr.status === "queued" && cr.note) return `השליחה ל-GitHub נכשלה (${cr.note}); המערכת תנסה שוב מעצמה`;
  if (cr.status === "paused") return "ממתינה בתור לבנייה: הבקשה שמורה ותצא מעצמה כשיגיע תורה (בקשה אחת בכל פעם; אם חסר קרדיט בחשבון Claude, רפאל מקבל הודעה)";
  if (cr.status === "question") return `הבנייה עצרה ושואלת את המורה: ${cr.question ?? ""} — כשהיא עונה, העבר את התשובה עם answer_build_question`;
  if (cr.status === "fix_queued") return "התיקון נרשם וייצא לבנייה מעצמו (בעוד כשתי דקות, או מיד כשהבנייה הנוכחית תסתיים)";
  if (cr.status === "failed") return "הבנייה נעצרה ולא הושלמה; רפאל קיבל הודעה";
  return `סטטוס: ${cr.status}`;
}

const QUEUE_NOTE = "ממתינה בתור — בקשה קודמת עדיין בבנייה; תישלח אוטומטית כשתסתיים";

// open the GitHub issue of a stored request — in this site's repository or,
// for a cross-site request, in the sister site's
async function openIssueFor(id: number) {
  // the cron and the chat's poll may send the same waiting request in the same
  // second (binat-hatorah #41/#42 — two issues, two builds): claim it first,
  // only one caller wins. A failed send frees the claim after two minutes.
  const claim = await db().execute({ sql: "UPDATE code_requests SET issue_url = 'sending', updated_at = ? WHERE id = ? AND issue_number IS NULL AND (issue_url IS NULL OR issue_url != 'sending' OR updated_at < ?)", args: [now(), id, now() - 120] });
  if (claim.rowsAffected !== 1) return;
  const row = (await db().execute({ sql: "SELECT title, body, repo, size FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!row) return;
  const repo = (row.repo as string | null) ?? SITE.repo;
  const sister = Object.values(SITE.sisters).find((s) => s.repo === repo);
  const title = String(row.title).replace(/^\[[^\]]+\] /, "");
  const body = String(row.body);
  const footer = sister
    ? `נשלח מהצ׳אט של המורה באתר ${SITE.name} כבקשה חוצת-אתרים ליישום כאן, באתר ${sister.name} (בקשה #${id}). המפרט אמור להיות מלא ועצמאי — אין גישה לקוד של האתר השולח; אם משהו חסר, יש ליישם לפי מיטב ההבנה בהתאם למבנה האתר הזה. יש ליישם, להריץ בנייה, ולפתוח Pull Request; המיזוג אוטומטי כשהבנייה עוברת.`
    : `נשלח מהצ׳אט של המורה באתר ${SITE.name} (בקשה #${id}). יש ליישם, להריץ בנייה, ולפתוח Pull Request; המיזוג אוטומטי כשהבנייה עוברת.`;
  try {
    const issue = (await gh(`/repos/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, labels: String(row.size ?? "") === "large" ? ["claude-chat", "large"] : ["claude-chat"], body: `@claude\n\n${body}\n\n---\n${footer}` }),
    })) as { number: number; html_url: string } | null;
    if (issue) await db().execute({ sql: "UPDATE code_requests SET issue_number = ?, issue_url = ?, status = 'open', note = NULL, updated_at = ? WHERE id = ?", args: [issue.number, issue.html_url, now(), id] });
  } catch (e) {
    await db().execute({ sql: "UPDATE code_requests SET note = ?, updated_at = ? WHERE id = ?", args: [e instanceof Error ? e.message : String(e), now(), id] });
  }
}

export async function listCodeRequests(userId: number): Promise<CodeRequestRow[]> {
  await ensureChatTables();
  const r = await db().execute({ sql: "SELECT * FROM code_requests WHERE user_id = ? ORDER BY id DESC LIMIT 30", args: [userId] });
  return r.rows.map((x) => ({
    id: Number(x.id),
    title: String(x.title),
    body: String(x.body),
    issueNumber: x.issue_number != null ? Number(x.issue_number) : null,
    issueUrl: x.issue_url && x.issue_url !== "sending" ? String(x.issue_url) : null,
    prUrl: (x.pr_url as string | null) ?? null,
    previewUrl: x.branch && ((x.repo as string | null) ?? SITE.repo) === SITE.repo ? previewUrlFor(String(x.branch)) : null,
    status: String(x.status),
    note: (x.note as string | null) ?? null,
    question: (x.question as string | null) ?? null,
    round: Number(x.round ?? 1) || 1,
    fixPending: x.pending_fix != null,
    createdAt: Number(x.created_at),
    updatedAt: Number(x.updated_at),
  }));
}

function previewUrlFor(branch: string): string {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `https://${SITE.vercelProject}-git-${slug}-${SITE.vercelTeam}.vercel.app`.slice(0, 250);
}

// Poll GitHub for the state of open requests (at most once a minute each).
const RESTART_MARK = "🔁 הפעלה מחדש אוטומטית";

// a build's question, once per GitHub comment: stored on the request and
// written into the teacher's chat as a message from Claude
async function surfaceBuildQuestion(id: number, q: { id: number; body: string }) {
  const r = (await db().execute({ sql: "SELECT user_id, title, question_comment_id FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!r || Number(r.question_comment_id ?? 0) === q.id) return;
  const text = q.body
    .replace(/^@\S+\s*/, "")
    .replace(/\[View job[^\n]*/gi, "")
    .replace(/\n?-{3,}\n?\[?branch[^\n]*/gi, "")
    .trim()
    .slice(0, 4000);
  await db().execute({ sql: "UPDATE code_requests SET question = ?, question_comment_id = ?, updated_at = ? WHERE id = ?", args: [text, q.id, now(), id] });
  const userId = Number(r.user_id);
  const thread = await currentThread(userId);
  const msg = `❓ שאלה מהבנייה של ״${String(r.title)}״ (בקשה #${id}):\n\n${text}\n\nאפשר לענות לי כאן בצ׳אט, ואעביר את התשובה לבנייה. אחרי התשובה הבנייה ממשיכה מעצמה.`;
  await db().execute({
    sql: "INSERT INTO teacher_chat_messages (user_id, thread, role, content_json, created_at) VALUES (?, ?, 'assistant', ?, ?)",
    args: [userId, thread, JSON.stringify([{ type: "text", text: msg }]), now()],
  });
}

interface IssueComment {
  id: number;
  body: string;
  user: { login: string; type: string };
  created_at: string;
  updated_at: string;
}

// what the build wrote for the teacher, without the action's own trailer
const cleanBotComment = (body: string) =>
  body
    .replace(/^@\S+\s*/, "")
    .replace(/\[View job[^\n]*/gi, "")
    .replace(/\n?-{3,}\n?\[?branch[^\n]*/gi, "")
    .trim()
    .slice(0, 2000);

async function tellTeacher(userId: number, text: string) {
  const thread = await currentThread(userId);
  await db().execute({
    sql: "INSERT INTO teacher_chat_messages (user_id, thread, role, content_json, created_at) VALUES (?, ?, 'assistant', ?, ?)",
    args: [userId, thread, JSON.stringify([{ type: "text", text }]), now()],
  });
}

// once per round: "it is on the site", in the chat, with what the build said
// it made — the teacher looks, and answers in the same conversation
async function announceBuilt(id: number, round: number, comments: IssueComment[], roundStart: number) {
  const claim = await db().execute({ sql: "UPDATE code_requests SET announced_round = ? WHERE id = ? AND COALESCE(announced_round, 0) < ?", args: [round, id, round] });
  if (claim.rowsAffected !== 1) return;
  const r = (await db().execute({ sql: "SELECT user_id, title FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!r) return;
  const said = [...comments].reverse().find((c) => c.user.type === "Bot" && c.user.login.toLowerCase().includes("claude") && Date.parse(c.created_at) >= roundStart);
  const summary = said ? cleanBotComment(said.body) : "";
  const head = round > 1 ? `✅ התיקון ל״${String(r.title)}״ עלה לאתר (בקשה #${id}, סבב ${round}).` : `✅ ״${String(r.title)}״ עלה לאתר (בקשה #${id}).`;
  await tellTeacher(
    Number(r.user_id),
    `${head} לפעמים עוברות דקה-שתיים עד שרואים את השינוי.${summary ? `\n\n${summary}` : ""}\n\nאם משהו לא יצא כמו שרצית, כתבי לי כאן מה לשנות, ואתקן באותה בקשה.`
  );
}

// A remark on something already built is a fix round of the same request, not
// a new request: the build then sees the original spec, what was built and
// the remark. Remarks wait two quiet minutes (FIX_QUIET) so several in a row
// go out as one round, and behind any build still running in the repository;
// refreshCodeRequests sends them. A request not sent yet just takes the
// remark into its body.
const FIX_QUIET = 120;
export async function reviseCodeRequest(id: number, feedback: string): Promise<CodeRequestRow> {
  await ensureChatTables();
  const r = (await db().execute({ sql: "SELECT user_id, body, status, issue_number, pending_fix FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!r) throw new Error("הבקשה לא נמצאה");
  const userId = Number(r.user_id);
  if (r.issue_number == null) {
    const body = `${String(r.body)}\n\n---\nתוספת מאותה מורה, לבנות יחד עם הבקשה שלמעלה:\n\n${feedback}`.slice(0, CODE_REQUEST_BODY_MAX);
    await db().execute({ sql: "UPDATE code_requests SET body = ?, updated_at = ? WHERE id = ?", args: [body, now(), id] });
  } else {
    const fix = r.pending_fix ? `${String(r.pending_fix)}\n\n${feedback}` : feedback;
    // a request in the middle of a build keeps its status; the fix follows it
    const inBuild = ["open", "working", "preview", "question"].includes(String(r.status));
    await db().execute({
      sql: "UPDATE code_requests SET pending_fix = ?, fix_at = ?, status = ?, updated_at = ? WHERE id = ?",
      args: [fix.slice(0, 20_000), now(), inBuild ? String(r.status) : "fix_queued", now(), id],
    });
  }
  return (await listCodeRequests(userId)).find((c) => c.id === id)!;
}

// send a waiting fix as an @claude comment on the request's own issue
async function sendFix(id: number): Promise<boolean> {
  const r = (await db().execute({ sql: "SELECT issue_number, repo, pending_fix, COALESCE(round, 1) AS round, pr_url, status FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!r || r.pending_fix == null || r.issue_number == null) return false;
  const fix = String(r.pending_fix);
  // the cron and the chat's poll may both get here: only one takes the fix
  const claim = await db().execute({ sql: "UPDATE code_requests SET pending_fix = NULL WHERE id = ? AND pending_fix = ?", args: [id, fix] });
  if (claim.rowsAffected !== 1) return false;
  const repo = (r.repo as string | null) ?? SITE.repo;
  const n = Number(r.issue_number);
  const round = Number(r.round) + 1;
  const built = r.pr_url ? `הבקשה כבר נבנתה ומוזגה (${String(r.pr_url)}), והקוד שלה נמצא ב-main. המורה ראתה את התוצאה באתר ומבקשת לתקן:` : "המורה מוסיפה לבקשה הזאת:";
  try {
    await gh(`/repos/${repo}/issues/${n}`, { method: "PATCH", body: JSON.stringify({ state: "open" }) }).catch(() => null);
    for (const label of ["build-failed", "waiting-credit"]) await gh(`/repos/${repo}/issues/${n}/labels/${label}`, { method: "DELETE" }).catch(() => null);
    await gh(`/repos/${repo}/issues/${n}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `@claude\n\n🔧 תיקון לבקשה הזאת (סבב ${round}). ${built}\n\n${fix}\n\nיש לעבוד על גבי main הנוכחי בענף חדש, לשנות רק את מה שהיא מבקשת, להריץ בנייה ולפתוח Pull Request חדש שמתחיל ב-"Closes #${n}".` }),
    });
    await db().execute({
      sql: "UPDATE code_requests SET status = 'working', round = ?, revised_at = ?, retried_at = ?, question = NULL, note = NULL, updated_at = ? WHERE id = ?",
      args: [round, now(), now(), now(), id],
    });
    return true;
  } catch (e) {
    await db().execute({ sql: "UPDATE code_requests SET pending_fix = ?, note = ?, updated_at = ? WHERE id = ?", args: [fix, e instanceof Error ? e.message : String(e), now(), id] });
    return false;
  }
}

export async function refreshCodeRequests(userId: number): Promise<CodeRequestRow[]> {
  await ensureChatTables();
  if (!process.env.GITHUB_TOKEN) return listCodeRequests(userId);
  const open = await db().execute({
    sql: "SELECT id, issue_number, repo, length(body) AS blen, COALESCE(retried_at, created_at) AS since, revised_at, COALESCE(round, 1) AS round, COALESCE(announced_round, 0) AS announced FROM code_requests WHERE issue_number IS NOT NULL AND status IN ('open','working','preview','paused','failed','question') AND updated_at < ?",
    args: [now() - 60],
  });
  for (const row of open.rows) {
    const n = Number(row.issue_number);
    const repo = (row.repo as string | null) ?? SITE.repo;
    try {
      const issue = (await gh(`/repos/${repo}/issues/${n}`)) as { state: string; labels?: { name: string }[] } | null;
      const prs = (await gh(`/repos/${repo}/pulls?state=all&per_page=50&sort=created&direction=desc`)) as { html_url: string; state: string; merged_at: string | null; created_at: string; head: { ref: string }; body: string | null; title: string }[] | null;
      // this issue's pull request — "issue-5" must not match "issue-52" — and,
      // after a fix round was sent, only one opened since (the earlier round's
      // merged pull request is history)
      const byBranch = new RegExp(`issue-${n}(?!\\d)`);
      const byRef = new RegExp(`#${n}(?!\\d)`);
      const roundStart = row.revised_at != null ? (Number(row.revised_at) - 60) * 1000 : 0;
      const pr = prs?.find((p) => (byBranch.test(p.head.ref) || byRef.test(p.body ?? "") || byRef.test(p.title)) && Date.parse(p.created_at) >= roundStart);
      // a closed issue ends the request whether or not a PR exists — a PR
      // closed without merge used to leave the request "working" for ever,
      // and every later request waited in the queue behind it
      // the build workflow labels a failed run: waiting-credit (the API
      // account needs credit — retried below) or build-failed (Rafael looks)
      const labels = new Set((issue?.labels ?? []).map((l) => l.name));
      let status = "working";
      if (pr?.merged_at) status = "merged";
      else if (pr && pr.state === "open") status = "preview";
      else if (issue?.state === "closed") status = "closed";
      else if (labels.has("waiting-credit")) status = "paused";
      else if (labels.has("build-failed")) status = "failed";
      // the build may stop to ask the teacher something — on GitHub, which she
      // never sees. The bot's last comment, a question, nothing after it:
      // relay it to her chat; her answer goes back as an @claude comment.
      // (Requests cut at 6,000 characters get their full text from
      // repairTruncatedRequests instead.)
      const blen = Number(row.blen ?? 0);
      if (status === "working" && issue?.state === "open" && !pr && !(blen >= 5990 && blen <= 6000)) {
        const comments = (await gh(`/repos/${repo}/issues/${n}/comments?per_page=100`)) as IssueComment[] | null;
        const last = comments?.[comments.length - 1];
        const asks = last ? /[?？]/.test(last.body.replace(/https?:\/\/\S+/g, "")) : false;
        if (last && asks && last.user.type === "Bot" && last.user.login.toLowerCase().includes("claude") && Date.now() - Date.parse(last.updated_at) > 120_000) {
          status = "question";
          await surfaceBuildQuestion(Number(row.id), { id: last.id, body: last.body });
        }
        // a build that never started (GitHub refused the run: binat-hatorah
        // #52 sat two days) or died without a label: an hour of silence and
        // nothing running → trigger it again, once. A second silent hour
        // marks it failed, so the teacher's card stops saying "working".
        if (status === "working" && comments && now() - Number(row.since ?? now()) > 3600) {
          const runs = (await gh(`/repos/${repo}/actions/workflows/claude-chat.yml/runs?per_page=10`)) as { workflow_runs: { status: string }[] } | null;
          const running = !runs || runs.workflow_runs.some((r) => r.status !== "completed");
          if (!running) {
            if (!comments.some((c) => c.body.includes(RESTART_MARK) && Date.parse(c.created_at) >= (Number(row.since ?? 0) - 7200) * 1000)) {
              await gh(`/repos/${repo}/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: `@claude\n\n${RESTART_MARK}: הבנייה של הבקשה לא התחילה או נעצרה בלי תוצאה. יש לבנות את הבקשה כפי שהיא, להריץ בנייה ולפתוח Pull Request.` }) });
              await db().execute({ sql: "UPDATE code_requests SET retried_at = ? WHERE id = ?", args: [now(), Number(row.id)] });
            } else {
              await gh(`/repos/${repo}/issues/${n}/labels`, { method: "POST", body: JSON.stringify({ labels: ["build-failed"] }) });
              status = "failed";
            }
          }
        }
      }
      await db().execute({ sql: "UPDATE code_requests SET status = ?, pr_url = ?, branch = ?, updated_at = ? WHERE id = ?", args: [status, pr?.html_url ?? null, pr?.head.ref ?? null, now(), Number(row.id)] });
      // the build is on the site: say so in the chat, with the build's own
      // words about what it made, so the teacher can look and answer there
      if (status === "merged" && Number(row.announced) < Number(row.round)) {
        const comments = (await gh(`/repos/${repo}/issues/${n}/comments?per_page=100`).catch(() => null)) as IssueComment[] | null;
        await announceBuilt(Number(row.id), Number(row.round), comments ?? [], roundStart);
      }
    } catch (e) {
      await db().execute({ sql: "UPDATE code_requests SET note = ?, updated_at = ? WHERE id = ?", args: [e instanceof Error ? e.message : String(e), now(), Number(row.id)] });
    }
  }
  // per repository: nothing in flight any more? send the oldest waiting request
  for (const repo of [SITE.repo, ...Object.values(SITE.sisters).map((s) => s.repo)]) {
    const still = await db().execute({
      sql: "SELECT COUNT(*) AS n FROM code_requests WHERE COALESCE(repo, ?) = ? AND status IN ('open','working','preview') AND COALESCE(retried_at, created_at) > CAST(strftime('%s','now') AS INTEGER) - 10800",
      args: [SITE.repo, repo],
    });
    if (Number(still.rows[0]?.n ?? 0) === 0) {
      const nextUp = await db().execute({ sql: "SELECT id FROM code_requests WHERE COALESCE(repo, ?) = ? AND status = 'queued' AND issue_number IS NULL ORDER BY id LIMIT 1", args: [SITE.repo, repo] });
      // a fix round first (it finishes something the teacher is waiting on)
      const fixUp = await db().execute({
        sql: "SELECT id FROM code_requests WHERE COALESCE(repo, ?) = ? AND pending_fix IS NOT NULL AND issue_number IS NOT NULL AND COALESCE(fix_at, 0) < ? ORDER BY fix_at LIMIT 1",
        args: [SITE.repo, repo, now() - FIX_QUIET],
      });
      const sentFix = fixUp.rows[0] ? await sendFix(Number(fixUp.rows[0].id)) : false;
      if (!sentFix && nextUp.rows[0]) await openIssueFor(Number(nextUp.rows[0].id));
      // a request paused for API credit is re-triggered by itself (an
      // "@claude" comment starts the build again); a failed attempt costs
      // nothing, so once credit is back the request simply goes through
      const paused = await db().execute({
        sql: "SELECT id, issue_number FROM code_requests WHERE COALESCE(repo, ?) = ? AND status = 'paused' AND issue_number IS NOT NULL AND COALESCE(retried_at, 0) < ? ORDER BY id LIMIT 1",
        args: [SITE.repo, repo, now() - 3600],
      });
      if (!sentFix && paused.rows[0]) {
        const pid = Number(paused.rows[0].id);
        try {
          await gh(`/repos/${repo}/issues/${Number(paused.rows[0].issue_number)}/comments`, {
            method: "POST",
            body: JSON.stringify({ body: "@claude ניסיון חוזר אוטומטי — בודקים אם הקרדיט חזר. יש לבנות את הבקשה כפי שהיא." }),
          });
          // the label goes, so the next refresh sees it as in flight (not paused)
          // and starts nothing beside it; a new failure puts the label back
          await gh(`/repos/${repo}/issues/${Number(paused.rows[0].issue_number)}/labels/waiting-credit`, { method: "DELETE" }).catch(() => null);
          await db().execute({ sql: "UPDATE code_requests SET retried_at = ?, status = 'working', updated_at = ? WHERE id = ?", args: [now(), now(), pid] });
        } catch (e) {
          await db().execute({ sql: "UPDATE code_requests SET retried_at = ?, note = ? WHERE id = ?", args: [now(), e instanceof Error ? e.message : String(e), pid] });
        }
      }
    }
  }
  return listCodeRequests(userId);
}

// ------------------------------------------------------------ the chat ----
const SYSTEM = `אתה קלוד — העוזר של המורה באתר "${SITE.name}" (תוכנית בתנ"ך לכיתה ${SITE.grade}, תיכון שחרית). המורה כותבת לך כאן ישירות כל מה שהיא רוצה לשנות, לעדכן, לבדוק או לשפר — ואתה מבצע. אין מתווך: מה שהיא מבקשת קורה.

איך זה עובד:
- כלי קריאה (list_units, get_unit, list_students, list_tasks, class_progress, get_lesson_plan, list_code_requests, list_exams, get_exam, get_class_slide, get_amana, get_amana_proposals, skills_report) פועלים מיד — השתמש בהם בחופשיות כדי לדעת את המצב האמיתי לפני שאתה מציע משהו.
- כלי שינוי (edit_unit_texts, edit_review, edit_discussion, reset_unit_edits, publish_unit, set_due_date, cancel_task, republish_task, mark_unit, mark_done_up_to, account_action, send_message, edit_exam, edit_exam_prep, edit_class_slide, amana_clause, amana_proposal, request_code_change) מבצעים מיד, בלי שום אישור — זה צ׳אט רגיל: היא כותבת, אתה עושה, ומספר במשפט-שניים מה בדיוק שונה (ציטוט קצר של הנוסח החדש כשזה טקסט). אל תשאל "האם לבצע?" ואל תציג אפשרויות לבחירה — רק אם הבקשה באמת דו-משמעית, שאל שאלה אחת קצרה. כל שינוי ניתן לביטול עם undo_change כשהיא מבקשת לבטל / להחזיר.
- שינוי שם התצוגה של תלמיד/ה (account_action עם action=rename, userId ו-name — השם המלא בעברית): קודם list_students כדי למצוא את החשבון (חשבון בלי שם מופיע עם name ריק — לזהות לפי המייל). השם שהמורה קבעה גובר על השם של התלמיד/ה ומופיע בכל האתר.
- איחוד חשבונות כפולים של תלמיד/ה (account_action עם action=merge): קודם list_students, ורק כשברור איזה חשבון נשאר (keepUserId) ואיזה מתמזג (userId). זו הפעולה היחידה שלא ניתנת לביטול — אמור/אמרי זאת, וספר/י בקצרה מה עבר (הכלי מחזיר סיכום).
- מבחנים: המבחן גלוי למורה בלבד — לעולם לא לתלמידים. לפני edit_exam או edit_exam_prep — תמיד get_exam קודם (מזהי השאלות, הנוסח והניקוד הנוכחיים). כשמשנים ניקוד — אמור/אמרי מה הסכום החדש. דף ההכנה מוסתר עד שהיא מבקשת לפרסם (publish=true); שאלות המבחן עצמן לא נכנסות לדף ההכנה.
- שקופית כללי השיעור (/dashboard/slide, למורה בלבד, מוקרנת בתחילת שיעור): כותרת, שלושה בלוקים — task (📝 המשימה), rules (📏 הכללים), done (🏠 סיימת?) — ושורת סיום. כשהיא מבקשת לעדכן אותה לשיעור הבא — get_class_slide ואז edit_class_slide (lines מחליף את כל השורות של הבלוק).
- אמנת הכיתה (פרויקט שנתי: בכל יחידה עיקרון מהפסוקים → מקרה מבית הספר → סעיף לאמנה; תלמידים רואים ב-/amana, המורה מנהלת ב-/dashboard/amana, הקרנה ב-/dashboard/amana/board): "תוסיף לאמנה את הסעיף…" — get_amana ואז amana_clause עם op=add (הנוסח בדיוק כפי שביקשה, ואם ידוע — הפסוק המבסס, המקור והיחידה). שינוי סטטוס (טיוטה / בדיון בכיתה / הוצג להנהלה / אושר) או הערות מהפגישה עם ההנהלה — amana_clause עם op=edit. "מה התלמידים הציעו ביחידה הזאת?" — get_amana_proposals עם ref, וסכם בקצרה את הכיוונים העיקריים עם מספר ה-👍. להציג הצעה לכיתה (בלי שם, אלא אם ביקשה) — amana_proposal. התלמידים לא עורכים סעיפים — רק רואים, מציעים בשאלות "מהפסוק לבית הספר · אמנת הכיתה" ונותנים 👍. שאלת אמנה ביחידה = שאלה שהתווית (label) שלה "מהפסוק לבית הספר · אמנת הכיתה" (אפשר להוסיף כזו ב-edit_unit_texts עם extra ו-label הזה).
- לפני עריכת טקסט ביחידה — תמיד get_unit קודם, כדי לערוך את הנוסח הנוכחי ולהשתמש במפתחות (key) הנכונים של השאלות והבלוקים.
- הפסוקים שמוצגים ליד שאלה (או ליד שדה בתוך שאלה) נערכים ב-edit_unit_texts דרך verses: מפתח "q-key" או "q-key:field-key", וערך כמו "ט״ז–כ׳" או "ד׳, כ״ג–כ״ד, ל״ב" (מספרי פסוקים בפרק הראשי של היחידה); "" מסיר את הפסוקים המוצמדים (ואז מוצגים אוטומטית הפסוקים שנוסח השאלה מזכיר); "none" מכבה את תיבת הפסוקים לגמרי (למשל בשאלת התמצאות בתנ״ך).
- כשהבקשה דורשת שינוי באתר עצמו (כפתור, מסך, התנהגות, עיצוב, דבר שאין לו כלי) — השתמש ב-request_code_change עם כותרת קצרה ומפרט מלא בעברית: איפה באתר, מה בדיוק, למה, מה התלמידים יראו ומה המורה. הבקשה נבנית ועולה לאתר אוטומטית (בדרך כלל תוך 10–30 דקות); היא תראה את הסטטוס בכרטיס. דווח לה בדיוק מה הכלי החזיר: אם status=open — "נשלחה לבנייה האוטומטית" עם הקישור; אם status=queued — "נרשמה וממתינה בתור, תישלח מעצמה כשהבקשה הקודמת תסתיים"; אם יש note עם שגיאה — אמור שהשליחה נכשלה ושהמערכת תנסה שוב מעצמה. אין "מפתחים" ואין מתווך אנושי — אל תכתוב שאתה "מעביר למפתחים"; זה צינור אוטומטי שאתה עצמך מפעיל. אם לא ברור מה בדיוק היא רוצה — שאל שאלה אחת ממוקדת לפני שאתה שולח. אם המורה מבקשת שהשינוי ייעשה גם (או רק) באתר האחות בינת התורה — השתמש ב-targets (למשל ["this", "binat-hatorah"], או ["binat-hatorah"] בלבד). באתר האחר קלוד אחר בונה לפי המפרט בלבד ואינו רואה את האתר הזה, לכן המפרט חייב להיות מלא ועצמאי, בלי "כמו כאן" ובלי שמות של קבצים מכאן. דווח לה על כל בקשה בנפרד לפי requests בתוצאה. בקשת קוד עולה דולרים, ועבודה בכלים שלך עולה אגורות: לפני request_code_change בדוק אם אחד הכלים שלך עושה את זה (נוסח, שאלות, תוכן יחידה, מועדים, פרסום, ביטול, הודעות, חשבונות) — אם כן, עשה זאת בכלי ואל תשלח בקשת קוד. בקשת קוד רק כשצריך באמת קוד חדש: מסך, כפתור, התנהגות או מבנה נתונים שאין להם כלי. בכל בקשת קוד ציין size: small לשינוי ממוקד (רוב הבקשות), large רק לפיצ׳ר חדש שנוגע בכמה מסכים או במבנה הנתונים. בקשה חדשה בזמן שקודמת עוד ממתינה בתור מצורפת אליה אוטומטית — אמור לה זאת לפי message. אם המורה הדביקה בצ׳אט טקסט ארוך (מבחן, דף הכנה, נוסח שיש להעתיק מילה במילה) — אל תעתיק אותו לגוף הבקשה: ההודעה המקורית שלה מצורפת לבקשה אוטומטית, מילה במילה. בגוף כתוב רק מה לעשות עם הטקסט ואיפה. הודעה בצ׳אט שמתחילה ב-״❓ שאלה מהבנייה״ היא שאלה שהבנייה האוטומטית שאלה ועצרה בגללה. כשהמורה עונה עליה, העבר את התשובה מיד עם answer_build_question (codeRequestId = מספר הבקשה שבהודעה), מנוסחת מלאה ועצמאית; אם התשובה נמצאת בכלים שלך (נוסח, תוכן יחידה), צרף את התוכן עצמו. אל תשלח בקשת קוד חדשה במקום זה. הודעה שמתחילה ב-״✅״ מודיעה שבקשת קוד עלתה לאתר ומה נבנה. זו שיחה, לא בקשה חד-פעמית: כשהמורה מעירה על משהו שנבנה בבקשת קוד (״לא ככה״, להזיז, לשנות, חסר, לא עובד) — זה תיקון לאותה בקשה. השתמש ב-revise_code_request עם codeRequestId של הבקשה (המספר שבהודעת ה-✅, או מ-list_code_requests) ו-feedback מלא ועצמאי: מה היא רואה עכשיו ומה צריך להיות במקום. רכז את כל ההערות שלה בקריאה אחת. אל תפתח request_code_change חדש בשביל תיקון של משהו שכבר נבנה; בקשה חדשה רק לדבר חדש שאינו קשור. אם התיקון הוא בנוסח או בתוכן שיש לך כלי בשבילו, עשה אותו בכלי ולא בבנייה. דווח לה לפי message.
- שאלות על "איך עושים X באתר" — ענה ישירות מהידע שלך על האתר (למטה).

סגנון: עברית, חם, קצר ופשוט. בלי Markdown (בלי כוכביות וכותרות); רשימות עם מקפים אם צריך. במבט אחד מבינים. כשמציעים ניסוח חדש — כתוב אותו במלואו. אל תמציא תוכן לימודי שהיא לא ביקשה; כשהיא מבקשת "לשפר" — הצע נוסח והסבר במשפט מה שונה.

מפת האתר (למורה): דשבורד מורה /dashboard · רשימת תלמידים ואישורי כניסה /dashboard/students · תוכן היחידות /dashboard/content ועריכה בעמוד כל משימה · מהלך השיעור (גלגלים: חזרה/דיון/לימוד, המסע) /dashboard/lesson · מצגת חזרה /dashboard/review/<taskId> · מצגת פתיחה /dashboard/opening/<taskId או ref> (רק ביחידות שיש להן, כרגע vayikra-16-5) · שקופית כללי השיעור /dashboard/slide (עריכה בכפתור בפינה או כאן בצ׳אט) · אמנת הכיתה /dashboard/amana (סעיפים, הצעות התלמידים, מעקב מול ההנהלה, גרסה לעיצוב A4/A3 וייצוא טקסט; הקרנה /dashboard/amana/board; לתלמידים /amana) ·כרטיסי כניסה ובקרת דיון /dashboard/discussion/<taskId>/control · לוח דיון מוקרן /dashboard/discussion/<taskId>/board · לוח כיתה מוקרן /dashboard/class-board/<taskId> · הגשות /dashboard/submission/<taskId>/<userId> · מבחנים (למורה בלבד: עריכה, מחוון, הדפסה, ודף ההכנה לתלמידים עם פרסום ומעקב) /dashboard/exams · קשר (צ׳אט אישי וקבוצתי) /messages · הצ׳אט הזה /dashboard/chat.
לתלמידים: המשימות /tasks, משימה /tasks/<id> (קריאה עם המורה מתנ"ך פיזי; באתר דף עבודה: הבנת הנקרא, שתי שאלות מיומנות, בניית טיעון שמזכה בכרטיס כניסה לדיון; עזרה קטנה מקלוד בכל שאלה; הגשה וביטול הגשה עד המועד), עמוד אישי /me, אמנת הכיתה /amana (צפייה, הצעות שהמורה הציגה ו-👍), קשר /messages. חשבון גוגל חדש ממתין לאישור המורה.

היחידות (ref — כותרת):
${unitsMap()}`;

export interface ChatTurnResult {
  reply: string;
  newActions: ActionRow[];
  messages: ChatMessageRow[];
}

// A thread stored with a tool call but no result (the function died
// mid-turn) made every later request fail with 400 ("tool_use ids found
// without tool_result"). History is repaired while loading: such calls are
// stripped from the stored message, results whose call is gone are dropped.
async function loadRepairedHistory(userId: number, thread: number): Promise<Anthropic.MessageParam[]> {
  const rows = (await db().execute({ sql: "SELECT id, role, content_json FROM teacher_chat_messages WHERE user_id = ? AND thread = ? ORDER BY id", args: [userId, thread] })).rows;
  const parsed = rows.map((r) => ({ id: Number(r.id), role: String(r.role) as "user" | "assistant", content: JSON.parse(String(r.content_json)) as Anthropic.ContentBlockParam[] | string }));
  const out: Anthropic.MessageParam[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const m = parsed[i];
    let content: Anthropic.ContentBlockParam[] = Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }];
    if (m.role === "assistant") {
      const calls = content.filter((b) => b.type === "tool_use").map((b) => (b as Anthropic.ToolUseBlockParam).id);
      if (calls.length) {
        const next = parsed[i + 1];
        const answered = new Set(
          next && next.role === "user" && Array.isArray(next.content)
            ? next.content.filter((b) => b.type === "tool_result").map((b) => (b as Anthropic.ToolResultBlockParam).tool_use_id)
            : []
        );
        if (calls.some((id) => !answered.has(id))) {
          content = content.filter((b) => b.type !== "tool_use");
          if (!content.some((b) => b.type === "text")) content = [...content, { type: "text", text: "(הפעולה נקטעה באמצע)" }];
          await db().execute({ sql: "UPDATE teacher_chat_messages SET content_json = ? WHERE id = ?", args: [JSON.stringify(content), m.id] });
        }
      }
    } else {
      const prev = out[out.length - 1];
      const open = new Set(
        prev && prev.role === "assistant" && Array.isArray(prev.content)
          ? prev.content.filter((b) => b.type === "tool_use").map((b) => (b as Anthropic.ToolUseBlockParam).id)
          : []
      );
      content = content.filter((b) => b.type !== "tool_result" || open.has((b as Anthropic.ToolResultBlockParam).tool_use_id));
      if (content.length === 0) continue;
    }
    // two messages in a row from the same side (a build's question written
    // into the chat after Claude's reply): one turn
    const last = out[out.length - 1];
    if (last && last.role === m.role && Array.isArray(last.content)) last.content = [...last.content, ...content];
    else out.push({ role: m.role, content });
  }
  return out;
}

// how long one turn may keep calling the model; the route's maxDuration is
// longer, so the turn always ends with a saved answer rather than a kill
const TURN_BUDGET_MS = 700_000;

export async function chatTurn(userId: number, teacherName: string | null, text: string): Promise<ChatTurnResult> {
  await ensureChatTables();
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("מפתח Claude לא מוגדר");
  const thread = await currentThread(userId);
  const messages = await loadRepairedHistory(userId, thread);
  // the volatile bits ride on the user turn, never in the (cached) system prompt
  const stamp = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full", timeStyle: "short" }).format(new Date());
  const userContent: Anthropic.ContentBlockParam[] = [{ type: "text", text: `[${stamp}${teacherName ? ` · ${teacherName}` : ""}]\n${text}` }];
  messages.push({ role: "user", content: userContent });
  const save = async (role: "user" | "assistant", content: unknown) => {
    await db().execute({
      sql: "INSERT INTO teacher_chat_messages (user_id, thread, role, content_json, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [userId, thread, role, JSON.stringify(content), now()],
    });
  };
  await save("user", userContent);

  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1 });
  const newActions: ActionRow[] = [];
  let reply = "";
  const startedAt = Date.now();
  for (let i = 0; i < 10; i++) {
    if (Date.now() - startedAt > TURN_BUDGET_MS) {
      reply = (reply ? reply + "\n\n" : "") + "עצרתי כאן כי הפעולה ארוכה — כתבי ״המשך״ ואמשיך מאותה נקודה.";
      await save("assistant", [{ type: "text", text: reply }]);
      break;
    }
    const res = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 12000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });
    const texts = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
    if (texts.length) reply = texts.join("\n").trim();
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const finished = res.stop_reason === "refusal" || uses.length === 0 || res.stop_reason === "end_turn" || res.stop_reason === "max_tokens";
    if (finished) {
      if (res.stop_reason === "refusal") reply = reply || "לא אוכל לעזור בבקשה הזאת.";
      // never store a tool call that will get no result
      const kept = res.content.filter((b) => b.type !== "tool_use");
      await save("assistant", kept.some((b) => b.type === "text") ? kept : [...kept, { type: "text", text: reply || "(ללא תשובה)" }]);
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      let out: unknown;
      try {
        if (u.name === "undo_change") {
          const which = Number(input.actionId) || 0;
          let targetId = which;
          if (!targetId) {
            const last = await db().execute({ sql: "SELECT id FROM teacher_chat_actions WHERE user_id = ? AND status = 'applied' AND undo_json IS NOT NULL ORDER BY id DESC LIMIT 1", args: [userId] });
            targetId = Number(last.rows[0]?.id ?? 0);
          }
          if (!targetId) out = { error: "nothing to undo" };
          else {
            const undone = await undoAction(targetId, userId);
            newActions.push(undone);
            out = { undone: true, actionId: targetId, summary: undone.summary };
          }
        } else if (READ_TOOLS.has(u.name)) {
          out = await runReadTool(u.name, input, userId);
        } else {
          if (u.name === "request_code_change") {
            const body = String(input.body ?? "");
            const pasted = pastedSinceLastRequest(messages).filter((t) => !body.includes(t.slice(0, 400)));
            if (pasted.length) {
              const add = `\n\n---\nהנוסח המקורי שהמורה שלחה בצ׳אט, מילה במילה (המקור הקובע לכל טקסט שביקשה להעתיק):\n\n${pasted.join("\n\n---\n\n")}`;
              input.body = (body + add).slice(0, CODE_REQUEST_BODY_MAX);
            }
          }
          const p = await buildProposal(u.name, input);
          if ("error" in p) out = { error: p.error };
          else {
            const ins = await db().execute({
              sql: "INSERT INTO teacher_chat_actions (user_id, thread, tool, input_json, summary, preview_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
              args: [userId, thread, u.name, JSON.stringify(input), p.summary, JSON.stringify(p.preview), now()],
            });
            const id = Number(ins.lastInsertRowid);
            // a plain chat: the change runs now; she can ask to undo it
            const done = await applyAction(id, userId);
            newActions.push(done);
            out =
              done.status === "applied"
                ? { done: true, actionId: id, summary: p.summary, result: done.result, undoable: done.undoable, changes: (p.preview as { changes?: unknown }).changes }
                : { error: (done.result as { error?: string } | null)?.error ?? "failed", actionId: id };
          }
        }
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      results.push({ type: "tool_result", tool_use_id: u.id, content: compact(out).slice(0, 60000) });
    }
    messages.push({ role: "user", content: results });
    // the call and its results are stored together, never one without the other
    await save("assistant", res.content);
    await save("user", results);
  }
  const all = await loadChat(userId);
  return { reply, newActions, messages: all.messages };
}
