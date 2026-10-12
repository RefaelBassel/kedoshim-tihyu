import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getAnthropicApiKey } from "./env";
import { CLAUDE_MODEL } from "./claude";
import { TASK_REGISTRY } from "@/content/tasks/registry";
import { effectiveContent } from "./content-overrides";
import { VAYIKRA_16 } from "@/content/tasks/vayikra-16-verses";
import { verseByNum, etnachtaSplit } from "./etnachta";
import type { QuestionBlock, TaskContent } from "@/content/tasks/types";

// Teacher-only exams. The teacher asks Claude for a draft built from what
// was actually taught (the units' content, including her edits), edits
// every question, swaps a question for another, and prints a student and
// a teacher version. Students never reach any of this: the pages live
// under /dashboard and the APIs require a teacher.
//
// First exam (Reut, 2026-10-11): Leviticus 16, all five units; the
// "concepts" part is only the skill of finding the etnachta — no hard words.

export interface ExamQuestion {
  id: string;
  text: string;
  points: number;
  answer: string; // teacher version only
  verseNum?: string; // etnachta questions: the verse the student works on
  verse?: string; // its exact text with cantillation (filled by the server)
  lines?: number; // answer lines in the student print (default by section)
}
export interface ExamSection {
  key: string;
  title: string;
  intro: string;
  questions: ExamQuestion[];
}
export interface ExamDoc {
  title: string;
  subtitle: string;
  instructions: string;
  durationMin: number;
  examDate?: string; // YYYY-MM-DD, printed on the exam and counted down on the prep card
  seed?: string; // set on exams the site created from content/exams
  sections: ExamSection[];
}
export interface ExamRow {
  id: number;
  title: string;
  status: "draft" | "ready";
  doc: ExamDoc;
  createdAt: number;
  updatedAt: number;
}

const now = () => Math.floor(Date.now() / 1000);
const CHAPTER_REFS = ["vayikra-16-1", "vayikra-16-2", "vayikra-16-3", "vayikra-16-4", "vayikra-16-5"];

let ready = false;
export async function ensureExamsTable() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS exams (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       title TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'draft',
       doc_json TEXT NOT NULL,
       created_by INTEGER,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  );
  ready = true;
}

function rowToExam(r: Record<string, unknown>): ExamRow {
  return {
    id: Number(r.id),
    title: String(r.title),
    status: String(r.status) === "ready" ? "ready" : "draft",
    doc: JSON.parse(String(r.doc_json)) as ExamDoc,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// The status as the teacher reads it. Neither status reaches students.
export const EXAM_STATUS_LABEL: Record<ExamRow["status"], string> = {
  draft: "טיוטה — מוסתר מהתלמידים",
  ready: "המחוון אושר — מוסתר מהתלמידים",
};

// Exams written ahead of time (content/exams) are created once, as drafts.
// The seed key is claimed in its own table first, so two first visits never
// create two copies and a seeded exam the teacher deleted does not return.
export async function ensureSeedExams() {
  await ensureExamsTable();
  await db().execute(`CREATE TABLE IF NOT EXISTS exam_seeds (key TEXT PRIMARY KEY, exam_id INTEGER, created_at INTEGER NOT NULL)`);
  const { EXAM_SEEDS } = await import("@/content/exams/registry");
  for (const seed of EXAM_SEEDS) {
    const claim = await db().execute({ sql: "INSERT OR IGNORE INTO exam_seeds (key, created_at) VALUES (?, ?)", args: [seed.key, now()] });
    if (claim.rowsAffected === 0) continue;
    try {
      const doc = sanitizeDoc({ ...(await seed.exam()), seed: seed.key });
      const t = now();
      const ins = await db().execute({
        sql: "INSERT INTO exams (title, status, doc_json, created_by, created_at, updated_at) VALUES (?, 'draft', ?, NULL, ?, ?)",
        args: [doc.title, JSON.stringify(doc), t, t],
      });
      const examId = Number(ins.lastInsertRowid);
      await db().execute({ sql: "UPDATE exam_seeds SET exam_id = ? WHERE key = ?", args: [examId, seed.key] });
      const { savePrep } = await import("./exam-prep");
      await savePrep(examId, await seed.prep(), "draft");
    } catch (e) {
      // let the next visit try again
      await db().execute({ sql: "DELETE FROM exam_seeds WHERE key = ? AND exam_id IS NULL", args: [seed.key] });
      throw e;
    }
  }
}

export async function listExams(): Promise<ExamRow[]> {
  await ensureSeedExams();
  const r = await db().execute("SELECT * FROM exams ORDER BY id DESC");
  return r.rows.map((x) => rowToExam(x as Record<string, unknown>));
}

export async function getExam(id: number): Promise<ExamRow | null> {
  await ensureExamsTable();
  const r = await db().execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [id] });
  return r.rows[0] ? rowToExam(r.rows[0] as Record<string, unknown>) : null;
}

export async function saveExam(id: number, doc: ExamDoc, status: "draft" | "ready"): Promise<ExamRow | null> {
  await ensureExamsTable();
  const clean = sanitizeDoc(doc);
  await db().execute({
    sql: "UPDATE exams SET title = ?, status = ?, doc_json = ?, updated_at = ? WHERE id = ?",
    args: [clean.title, status, JSON.stringify(clean), now(), id],
  });
  return getExam(id);
}

export async function deleteExam(id: number) {
  await ensureExamsTable();
  await db().execute({ sql: "DELETE FROM exams WHERE id = ?", args: [id] });
}

export function totalPoints(doc: ExamDoc): number {
  return doc.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + (Number(q.points) || 0), 0), 0);
}

export { verseByNum, etnachtaSplit } from "./etnachta";

// ---------- what was taught: the source for Claude ----------
async function chapterSource(): Promise<string> {
  const parts: string[] = [];
  parts.push("## הפרק כולו (ויקרא ט״ז), עם טעמי המקרא:");
  for (const v of VAYIKRA_16) parts.push(`(${v.num}) ${v.text}`);
  for (const ref of CHAPTER_REFS) {
    const reg = TASK_REGISTRY[ref];
    if (!reg) continue;
    const c: TaskContent = await effectiveContent(reg.content);
    parts.push(`\n## יחידה: ${c.title} · ${c.bookRef}`);
    if (c.readingIntro) parts.push(`פתיח: ${c.readingIntro}`);
    if (c.comprehension?.length) {
      parts.push("שאלות הבנה שנלמדו:");
      for (const q of c.comprehension) parts.push(`- ${q.prompt}`);
    }
    for (const sec of c.sections) {
      parts.push(`### ${sec.title}`);
      for (const b of sec.blocks) {
        if (b.type === "question") {
          const q = b as QuestionBlock;
          parts.push(`- [${q.label}] ${q.prompt}${q.helper ? ` (${q.helper})` : ""}`);
        }
        if (b.type === "source") parts.push(`מקור שנלמד — ${b.title}: ${b.text}`);
      }
    }
    if (c.review?.points?.length) {
      parts.push("נקודות החזרה של היחידה:");
      for (const p of c.review.points) parts.push(`- ${p}`);
      if (c.review.skill) parts.push(`מיומנות היחידה: ${c.review.skill}`);
    }
    if (c.discussion?.question) parts.push(`שאלת הדיון: ${c.discussion.question}`);
  }
  return parts.join("\n");
}

const EXAM_SYSTEM = `אתה מחבר מבחן ידע בתנ"ך לכיתה ט (בנים ובנות) בתיכון שחרית, על ויקרא פרק ט"ז — עבודת יום הכיפורים.
המבחן נבנה אך ורק על מה שנלמד בכיתה: הפסוקים, השאלות, נקודות החזרה ושאלות הדיון של חמש היחידות שתקבל. פשט בלבד; אין להביא פרשנים או ידע חיצוני שלא מופיע ביחידות.
עברית ברורה לכיתה ט. כל שאלה מנוסחת כך שתלמיד/ה שלמד/ה את היחידות יכול/ה לענות מתוך הפסוקים, ומי שלא למד/ה — לא.

מבנה קבוע, 100 נקודות:
1. key="pshat" — בקיאות בפשט: 6 שאלות קצרות וחד-משמעיות על מה כתוב (מי, מה, מתי, כמה, באיזה סדר). 4 נק' כל אחת = 24.
2. key="etnachta" — זיהוי אתנחתא: 6 שאלות. בכל שאלה תבחר פסוק אחד מהפרק (ציין את מספרו ב-verseNum, באות עברית כמו במקור, למשל "ג" או "יב"). התלמיד/ה מקבל/ת את הפסוק עם טעמי המקרא, ועליו/ה לסמן את המילה שבה האתנחתא, לחלק את הפסוק לשני חלקיו, ולכתוב במשפט מה אומר כל חלק ומה מלמדת החלוקה. בחר פסוקים שבהם החלוקה באמת מאירה משהו. בשדה text כתוב את ההוראה לתלמיד בלבד (בלי הפסוק — הוא יוצג אוטומטית); בשדה answer כתוב מה החלוקה מלמדת (המילה עצמה תתווסף אוטומטית). 3 נק' כל אחת = 18. אין לשאול על מילים קשות.
3. key="quotes" — זיהוי פסוקים והקשרם: 4 ציטוטים קצרים ומדויקים מהפרק (עם ניקוד, בלי טעמים). לכל ציטוט: מי אומר/עושה, באיזה שלב של העבודה, ומה קורה מיד לפני או אחרי. 4 נק' כל אחת = 16.
4. key="study" — שאלות עיון: 3 שאלות פתוחות שדורשות השוואה או הסבר מתוך הפסוקים (למשל שני השעירים, בגדי הבד, סדר הכניסות לקודש, "חוקת עולם"). 9 נק' כל אחת = 27.
5. key="argument" — שאלת טיעון: שאלה אחת שמבוססת על אחת משאלות הדיון של היחידות; התלמיד/ה נוקט/ת עמדה, מביא/ה שני נימוקים מהפסוקים ומתייחס/ת לצד השני. 15 נק'.

לכל שאלה כתוב גם answer — תשובה צפויה/מחוון קצר למורה, עם הפניה לפסוקים.
title: "מבחן בתנ"ך — ויקרא ט"ז: עבודת יום הכיפורים". subtitle: שורה קצרה. instructions: הוראות לתלמיד (משך, לכתוב בעט, לענות מתוך הפסוקים, חלוקת הנקודות). durationMin: 60.
החזר אך ורק דרך הכלי propose_exam.`;

const EXAM_TOOL: Anthropic.Tool = {
  name: "propose_exam",
  description: "המבחן המלא",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      subtitle: { type: "string" },
      instructions: { type: "string" },
      durationMin: { type: "integer" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            title: { type: "string" },
            intro: { type: "string", description: "הוראה קצרה לחלק" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  points: { type: "integer" },
                  answer: { type: "string" },
                  verseNum: { type: "string", description: "רק בחלק האתנחתא: מספר הפסוק באות עברית" },
                },
                required: ["text", "points", "answer", "verseNum"],
                additionalProperties: false,
              },
            },
          },
          required: ["key", "title", "intro", "questions"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "subtitle", "instructions", "durationMin", "sections"],
    additionalProperties: false,
  },
  strict: true,
};

const QUESTION_TOOL: Anthropic.Tool = {
  name: "propose_question",
  description: "שאלה חלופית אחת",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      points: { type: "integer" },
      answer: { type: "string" },
      verseNum: { type: "string", description: "רק בחלק האתנחתא: מספר הפסוק באות עברית; אחרת מחרוזת ריקה" },
    },
    required: ["text", "points", "answer", "verseNum"],
    additionalProperties: false,
  },
  strict: true,
};

function client(timeoutMs: number) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("מפתח Claude לא מוגדר.");
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
}

function toolInput(msg: Anthropic.Message, name: string): Record<string, unknown> | null {
  const tool = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === name);
  if (tool) return tool.input as Record<string, unknown>;
  // no tool call: a JSON object in the text is the fallback
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let qid = 0;
const freshId = () => `q${Date.now().toString(36)}${(qid++).toString(36)}`;

// etnachta questions get the exact verse and the computed split; every
// question gets an id and sane numbers
export function sanitizeDoc(raw: ExamDoc): ExamDoc {
  const sections = (raw.sections ?? []).map((s) => ({
    key: String(s.key || "part").slice(0, 40),
    title: String(s.title || "").slice(0, 200),
    intro: String(s.intro || "").slice(0, 1000),
    questions: (s.questions ?? []).map((q) => completeQuestion(s.key, q)),
  }));
  const examDate = String(raw.examDate ?? "").trim();
  return {
    title: String(raw.title || "מבחן").slice(0, 200),
    subtitle: String(raw.subtitle || "").slice(0, 300),
    instructions: String(raw.instructions || "").slice(0, 3000),
    durationMin: Math.min(Math.max(10, Math.round(Number(raw.durationMin) || 60)), 240),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(examDate) ? { examDate } : {}),
    ...(raw.seed ? { seed: String(raw.seed).slice(0, 80) } : {}),
    sections,
  };
}

export { formatExamDate, questionNumbers } from "./exam-export-shared";
// ---------- edits by operation (the teacher's chat with Claude) ----------
export type ExamOp =
  | { op: "update"; questionId: string; text?: string; answer?: string; points?: number; lines?: number }
  | { op: "add"; sectionKey: string; text: string; answer?: string; points?: number; lines?: number; position?: number }
  | { op: "delete"; questionId: string }
  | { op: "move"; questionId: string; sectionKey?: string; position: number };

export interface ExamPatch {
  title?: string;
  subtitle?: string;
  instructions?: string;
  durationMin?: number;
  examDate?: string;
  sections?: Record<string, { title?: string; intro?: string }>;
  ops?: ExamOp[];
}

// Applies a patch to a copy of the doc; throws (in Hebrew) on a bad reference.
export function applyExamPatch(doc: ExamDoc, patch: ExamPatch): ExamDoc {
  const next: ExamDoc = JSON.parse(JSON.stringify(doc));
  if (typeof patch.title === "string") next.title = patch.title;
  if (typeof patch.subtitle === "string") next.subtitle = patch.subtitle;
  if (typeof patch.instructions === "string") next.instructions = patch.instructions;
  if (patch.durationMin != null) next.durationMin = Number(patch.durationMin);
  if (typeof patch.examDate === "string") next.examDate = patch.examDate;
  for (const [key, v] of Object.entries(patch.sections ?? {})) {
    const s = next.sections.find((x) => x.key === key);
    if (!s) throw new Error(`החלק ${key} לא נמצא`);
    if (typeof v.title === "string") s.title = v.title;
    if (typeof v.intro === "string") s.intro = v.intro;
  }
  const locate = (id: string) => {
    for (const s of next.sections) {
      const i = s.questions.findIndex((q) => q.id === id);
      if (i >= 0) return { s, i };
    }
    throw new Error(`השאלה ${id} לא נמצאה`);
  };
  const at = (len: number, position?: number) =>
    position == null ? len : Math.min(Math.max(0, Math.round(position) - 1), len);
  for (const op of patch.ops ?? []) {
    if (op.op === "update") {
      const { s, i } = locate(op.questionId);
      const q = s.questions[i];
      if (typeof op.text === "string") q.text = op.text;
      if (typeof op.answer === "string") q.answer = op.answer;
      if (op.points != null) q.points = Number(op.points);
      if (op.lines != null) q.lines = Number(op.lines);
    } else if (op.op === "add") {
      const s = next.sections.find((x) => x.key === op.sectionKey);
      if (!s) throw new Error(`החלק ${op.sectionKey} לא נמצא`);
      const q: ExamQuestion = { id: freshId(), text: op.text, answer: op.answer ?? "", points: Number(op.points) || 0, ...(op.lines != null ? { lines: Number(op.lines) } : {}) };
      s.questions.splice(at(s.questions.length, op.position), 0, q);
    } else if (op.op === "delete") {
      const { s, i } = locate(op.questionId);
      s.questions.splice(i, 1);
    } else if (op.op === "move") {
      const { s, i } = locate(op.questionId);
      const [q] = s.questions.splice(i, 1);
      const target = op.sectionKey ? next.sections.find((x) => x.key === op.sectionKey) : s;
      if (!target) throw new Error(`החלק ${op.sectionKey} לא נמצא`);
      target.questions.splice(at(target.questions.length, op.position), 0, q);
    }
  }
  return sanitizeDoc(next);
}

export function completeQuestion(sectionKey: string, q: Partial<ExamQuestion>): ExamQuestion {
  const out: ExamQuestion = {
    id: String(q.id || freshId()),
    text: String(q.text || "").slice(0, 3000),
    points: Math.min(Math.max(0, Math.round(Number(q.points) || 0)), 100),
    answer: String(q.answer || "").slice(0, 4000),
  };
  if (q.lines != null && Number.isFinite(Number(q.lines))) out.lines = Math.min(Math.max(0, Math.round(Number(q.lines))), 30);
  const num = String(q.verseNum || "").trim();
  if (sectionKey === "etnachta" && num) {
    const verse = verseByNum(num);
    if (verse) {
      out.verseNum = num;
      out.verse = verse;
      const split = etnachtaSplit(verse);
      if (split && !out.answer.includes(split.word)) {
        out.answer = `האתנחתא במילה ״${split.word}״. חלק א: ${split.first} · חלק ב: ${split.second}${out.answer ? `\n${out.answer}` : ""}`;
      }
    }
  }
  return out;
}

// ---------- generation ----------
export async function generateChapter16Exam(createdBy: number): Promise<ExamRow> {
  await ensureExamsTable();
  const source = await chapterSource();
  const msg = await client(600_000).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: EXAM_SYSTEM }],
    tools: [EXAM_TOOL],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: `מה שנלמד בכיתה:\n\n${source}\n\nחבר את המבחן.` }],
  });
  const input = toolInput(msg, "propose_exam");
  if (!input || !Array.isArray(input.sections)) {
    throw new Error(`קלוד לא החזיר מבחן (${msg.stop_reason ?? "?"}) — נסי שוב.`);
  }
  const doc = sanitizeDoc(input as unknown as ExamDoc);
  const t = now();
  const ins = await db().execute({
    sql: "INSERT INTO exams (title, status, doc_json, created_by, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?)",
    args: [doc.title, JSON.stringify(doc), createdBy, t, t],
  });
  return (await getExam(Number(ins.lastInsertRowid)))!;
}

export async function regenerateQuestion(
  exam: ExamRow,
  sectionKey: string,
  questionId: string,
  instruction: string
): Promise<ExamQuestion> {
  const section = exam.doc.sections.find((s) => s.key === sectionKey);
  if (!section) throw new Error("החלק לא נמצא");
  const current = section.questions.find((q) => q.id === questionId);
  if (!current) throw new Error("השאלה לא נמצאה");
  const source = await chapterSource();
  const others = exam.doc.sections
    .flatMap((s) => s.questions.map((q) => `[${s.title}] ${q.text}`))
    .join("\n");
  const msg = await client(300_000).messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 6000,
    system: [{ type: "text", text: EXAM_SYSTEM + "\n\nעכשיו מבקשים ממך שאלה חלופית אחת בלבד, לאותו חלק, באותו ניקוד, שלא חוזרת על שאלה קיימת. החזר אך ורק דרך הכלי propose_question." }],
    tools: [QUESTION_TOOL],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [
      {
        role: "user",
        content: `מה שנלמד בכיתה:\n\n${source}\n\nהחלק: ${section.title} (key=${section.key}). ${section.intro}\nהשאלה הנוכחית שיש להחליף (${current.points} נק'): ${current.text}\nשאר השאלות במבחן (לא לחזור עליהן):\n${others}\n${instruction ? `\nבקשת המורה לשאלה החדשה: ${instruction}` : ""}`,
      },
    ],
  });
  const input = toolInput(msg, "propose_question");
  if (!input || !input.text) throw new Error("קלוד לא החזיר שאלה — נסי שוב.");
  return completeQuestion(sectionKey, {
    id: current.id,
    text: String(input.text),
    points: Number(input.points) || current.points,
    answer: String(input.answer ?? ""),
    verseNum: String(input.verseNum ?? ""),
  });
}
