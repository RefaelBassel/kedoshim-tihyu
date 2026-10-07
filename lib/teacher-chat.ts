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
import { approveUser, blockUser, listAccounts, makeStudent, makeTeacher, preApproveEmail, unblockUser } from "./approval";
import { sendGroupMessage, sendMessage } from "./messages";
import { formatHebDateTime, israelLocalToUnix } from "./hebrew";

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
        if (b.type === "question") return { key: b.key, type: b.type, label: b.label, prompt: b.prompt, helper: b.helper ?? null, fields: b.fields ?? null, minWords: b.minWords ?? null };
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
const READ_TOOLS = new Set(["list_units", "get_unit", "list_students", "class_progress", "list_tasks", "get_lesson_plan", "list_code_requests"]);

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_units",
    description: "All units of the year in curriculum order with: ref, title, position, taskId (null = not published yet), assigned count, how many students completed, whether review/discussion/study were done, due date. Use before anything that touches a unit.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_unit",
    description: "The full current text of one unit as students see it (after the teacher's edits): title, subtitle, reading intro, review deck points, discussion question + teacher note, every section with its blocks (questions have key/label/prompt/helper/fields). Always call this before proposing a text edit, and quote the current text in the proposal.",
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
  // ---- write (proposals) ----
  {
    name: "edit_unit_texts",
    description: "Change texts of a unit in place: title/subtitle/readingIntro, question prompts (by question key), hide or unhide questions, add a teacher question to a section, section titles/minutes, intro/source/case texts (by block key). Only pass what changes. Each call is ONE proposal the teacher confirms.",
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
    description: "Approve a pending account, block / unblock, mark an account as a teacher or back as a student, or pre-approve an email that has not signed in yet.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["approve", "block", "unblock", "make_teacher", "make_student", "pre_approve_email"] },
        userId: { type: "integer" },
        email: { type: "string" },
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
    name: "undo_change",
    description: "Revert a change made earlier in this chat (its actionId was returned when it ran). Without actionId: the most recent revertible change. Use when the teacher asks to cancel / undo / put back.",
    input_schema: { type: "object", properties: { actionId: { type: "integer" } }, additionalProperties: false },
  },
  {
    name: "request_code_change",
    description: "For anything that needs a change to the site itself (a new button, screen, behaviour, design, a feature that no other tool covers): write a precise request for the developer pipeline. title: short Hebrew title. body: full Hebrew spec — where in the site, what exactly should change, why, what students vs. the teacher should see. The pipeline implements it, builds it and publishes it to the site by itself; the teacher sees the status in the chat.",
    input_schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false },
  },
];

const KIND_HE: Record<string, string> = { review: "חזרה", discussion: "דיון", study: "לימוד" };

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
    case "list_code_requests":
      return (await listCodeRequests(userId)).map((c) => ({ id: c.id, title: c.title, status: c.status, issueUrl: c.issueUrl, prUrl: c.prUrl, previewUrl: c.previewUrl, note: c.note }));
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
      const acc = (await listAccounts()).find((a) => a.id === Number(input.userId));
      if (!acc) return { error: "account not found" };
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
    case "request_code_change": {
      const title = str(input.title, 120);
      const body = str(input.body, 6000);
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
        break;
      }
      case "send_message": {
        const text = str(input.text, 4000);
        if (input.to === "student") await sendMessage(userId, Number(input.userId), text);
        else await sendGroupMessage(userId, text);
        break;
      }
      case "request_code_change": {
        const cr = await createCodeRequest(userId, str(input.title, 120), str(input.body, 6000));
        result = { codeRequestId: cr.id, status: cr.status, issueUrl: cr.issueUrl };
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

export async function createCodeRequest(userId: number, title: string, body: string): Promise<CodeRequestRow> {
  await ensureChatTables();
  const t = now();
  const ins = await db().execute({
    sql: "INSERT INTO code_requests (user_id, title, body, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)",
    args: [userId, title, body, t, t],
  });
  const id = Number(ins.lastInsertRowid);
  // one request at a time per site: parallel branches on the same code
  // conflicted and the second could not be merged. A request made while
  // another is still being built waits in the queue and is sent by itself
  // the moment the previous one is merged or closed (see refreshCodeRequests).
  const inFlight = await db().execute({ sql: "SELECT COUNT(*) AS n FROM code_requests WHERE status IN ('open','working','preview')", args: [] });
  if (Number(inFlight.rows[0]?.n ?? 0) > 0) {
    await db().execute({ sql: "UPDATE code_requests SET note = ?, updated_at = ? WHERE id = ?", args: [QUEUE_NOTE, now(), id] });
    return (await listCodeRequests(userId)).find((c) => c.id === id)!;
  }
  await openIssueFor(id);
  return (await listCodeRequests(userId)).find((c) => c.id === id)!;
}

const QUEUE_NOTE = "ממתינה בתור — בקשה קודמת עדיין בבנייה; תישלח אוטומטית כשתסתיים";

// open the GitHub issue of a stored request
async function openIssueFor(id: number) {
  const row = (await db().execute({ sql: "SELECT title, body FROM code_requests WHERE id = ?", args: [id] })).rows[0];
  if (!row) return;
  const title = String(row.title);
  const body = String(row.body);
  try {
    const issue = (await gh(`/repos/${SITE.repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        labels: ["claude-chat"],
        body: `@claude\n\n${body}\n\n---\nנשלח מהצ׳אט של המורה באתר ${SITE.name} (בקשה #${id}). יש ליישם, להריץ בנייה, ולפתוח Pull Request; המיזוג אוטומטי כשהבנייה עוברת.`,
      }),
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
    issueUrl: (x.issue_url as string | null) ?? null,
    prUrl: (x.pr_url as string | null) ?? null,
    previewUrl: x.branch ? previewUrlFor(String(x.branch)) : null,
    status: String(x.status),
    note: (x.note as string | null) ?? null,
    createdAt: Number(x.created_at),
    updatedAt: Number(x.updated_at),
  }));
}

function previewUrlFor(branch: string): string {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `https://${SITE.vercelProject}-git-${slug}-${SITE.vercelTeam}.vercel.app`.slice(0, 250);
}

// Poll GitHub for the state of open requests (at most once a minute each).
export async function refreshCodeRequests(userId: number): Promise<CodeRequestRow[]> {
  await ensureChatTables();
  if (!process.env.GITHUB_TOKEN) return listCodeRequests(userId);
  const open = await db().execute({
    sql: "SELECT id, issue_number, status, updated_at FROM code_requests WHERE issue_number IS NOT NULL AND status IN ('open','working','preview') AND updated_at < ?",
    args: [now() - 60],
  });
  for (const row of open.rows) {
    const n = Number(row.issue_number);
    try {
      const issue = (await gh(`/repos/${SITE.repo}/issues/${n}`)) as { state: string } | null;
      // the PR that references the issue: by branch convention first, then by search
      const prs = (await gh(`/repos/${SITE.repo}/pulls?state=all&per_page=50&sort=created&direction=desc`)) as { html_url: string; state: string; merged_at: string | null; head: { ref: string }; body: string | null; title: string }[] | null;
      const pr = prs?.find((p) => p.head.ref.includes(`issue-${n}`) || (p.body ?? "").includes(`#${n}`) || p.title.includes(`#${n}`));
      let status = "working";
      if (pr?.merged_at) status = "merged";
      else if (pr && pr.state === "open") status = "preview";
      else if (issue?.state === "closed" && !pr) status = "closed";
      await db().execute({
        sql: "UPDATE code_requests SET status = ?, pr_url = ?, branch = ?, updated_at = ? WHERE id = ?",
        args: [status, pr?.html_url ?? null, pr?.head.ref ?? null, now(), Number(row.id)],
      });
    } catch (e) {
      await db().execute({ sql: "UPDATE code_requests SET note = ?, updated_at = ? WHERE id = ?", args: [e instanceof Error ? e.message : String(e), now(), Number(row.id)] });
    }
  }
  // nothing in flight any more? send the oldest waiting request
  const still = await db().execute({ sql: "SELECT COUNT(*) AS n FROM code_requests WHERE status IN ('open','working','preview')", args: [] });
  if (Number(still.rows[0]?.n ?? 0) === 0) {
    const nextUp = await db().execute({ sql: "SELECT id FROM code_requests WHERE status = 'queued' AND issue_number IS NULL ORDER BY id LIMIT 1", args: [] });
    if (nextUp.rows[0]) await openIssueFor(Number(nextUp.rows[0].id));
  }
  return listCodeRequests(userId);
}

// ------------------------------------------------------------ the chat ----
const SYSTEM = `אתה קלוד — העוזר של המורה באתר "${SITE.name}" (תוכנית בתנ"ך לכיתה ${SITE.grade}, תיכון שחרית). המורה כותבת לך כאן ישירות כל מה שהיא רוצה לשנות, לעדכן, לבדוק או לשפר — ואתה מבצע. אין מתווך: מה שהיא מבקשת קורה.

איך זה עובד:
- כלי קריאה (list_units, get_unit, list_students, list_tasks, class_progress, get_lesson_plan, list_code_requests) פועלים מיד — השתמש בהם בחופשיות כדי לדעת את המצב האמיתי לפני שאתה מציע משהו.
- כלי שינוי (edit_unit_texts, edit_review, edit_discussion, reset_unit_edits, publish_unit, set_due_date, cancel_task, republish_task, mark_unit, mark_done_up_to, account_action, send_message, request_code_change) מבצעים מיד, בלי שום אישור — זה צ׳אט רגיל: היא כותבת, אתה עושה, ומספר במשפט-שניים מה בדיוק שונה (ציטוט קצר של הנוסח החדש כשזה טקסט). אל תשאל "האם לבצע?" ואל תציג אפשרויות לבחירה — רק אם הבקשה באמת דו-משמעית, שאל שאלה אחת קצרה. כל שינוי ניתן לביטול עם undo_change כשהיא מבקשת לבטל / להחזיר.
- לפני עריכת טקסט ביחידה — תמיד get_unit קודם, כדי לערוך את הנוסח הנוכחי ולהשתמש במפתחות (key) הנכונים של השאלות והבלוקים.
- כשהבקשה דורשת שינוי באתר עצמו (כפתור, מסך, התנהגות, עיצוב, דבר שאין לו כלי) — השתמש ב-request_code_change עם כותרת קצרה ומפרט מלא בעברית: איפה באתר, מה בדיוק, למה, מה התלמידים יראו ומה המורה. הבקשה נבנית ועולה לאתר אוטומטית (בדרך כלל תוך 10–30 דקות); היא תראה את הסטטוס בכרטיס. אם לא ברור מה בדיוק היא רוצה — שאל שאלה אחת ממוקדת לפני שאתה שולח.
- שאלות על "איך עושים X באתר" — ענה ישירות מהידע שלך על האתר (למטה).

סגנון: עברית, חם, קצר ופשוט. בלי Markdown (בלי כוכביות וכותרות); רשימות עם מקפים אם צריך. במבט אחד מבינים. כשמציעים ניסוח חדש — כתוב אותו במלואו. אל תמציא תוכן לימודי שהיא לא ביקשה; כשהיא מבקשת "לשפר" — הצע נוסח והסבר במשפט מה שונה.

מפת האתר (למורה): דשבורד מורה /dashboard · רשימת תלמידים ואישורי כניסה /dashboard/students · תוכן היחידות /dashboard/content ועריכה בעמוד כל משימה · מהלך השיעור (גלגלים: חזרה/דיון/לימוד, המסע) /dashboard/lesson · מצגת חזרה /dashboard/review/<taskId> · כרטיסי כניסה ובקרת דיון /dashboard/discussion/<taskId>/control · לוח דיון מוקרן /dashboard/discussion/<taskId>/board · לוח כיתה מוקרן /dashboard/class-board/<taskId> · הגשות /dashboard/submission/<taskId>/<userId> · קשר (צ׳אט אישי וקבוצתי) /messages · הצ׳אט הזה /dashboard/chat.
לתלמידים: המשימות /tasks, משימה /tasks/<id> (קריאה עם המורה מתנ"ך פיזי; באתר דף עבודה: הבנת הנקרא, שתי שאלות מיומנות, בניית טיעון שמזכה בכרטיס כניסה לדיון; עזרה קטנה מקלוד בכל שאלה; הגשה וביטול הגשה עד המועד), עמוד אישי /me, קשר /messages. חשבון גוגל חדש ממתין לאישור המורה.

היחידות (ref — כותרת):
${unitsMap()}`;

export interface ChatTurnResult {
  reply: string;
  newActions: ActionRow[];
  messages: ChatMessageRow[];
}

export async function chatTurn(userId: number, teacherName: string | null, text: string): Promise<ChatTurnResult> {
  await ensureChatTables();
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("מפתח Claude לא מוגדר");
  const thread = await currentThread(userId);
  const history = await db().execute({
    sql: "SELECT role, content_json FROM teacher_chat_messages WHERE user_id = ? AND thread = ? ORDER BY id",
    args: [userId, thread],
  });
  const messages: Anthropic.MessageParam[] = history.rows.map((r) => ({ role: String(r.role) as "user" | "assistant", content: JSON.parse(String(r.content_json)) }));
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

  const client = new Anthropic({ apiKey });
  const newActions: ActionRow[] = [];
  let reply = "";
  for (let i = 0; i < 10; i++) {
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });
    await save("assistant", res.content);
    const texts = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
    if (texts.length) reply = texts.join("\n").trim();
    if (res.stop_reason === "refusal") {
      reply = reply || "לא אוכל לעזור בבקשה הזאת.";
      break;
    }
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0 || res.stop_reason === "end_turn") break;
    if (res.stop_reason === "max_tokens") break;
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
    await save("user", results);
  }
  const all = await loadChat(userId);
  return { reply, newActions, messages: all.messages };
}
