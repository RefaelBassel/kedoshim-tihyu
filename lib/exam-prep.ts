import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getAnthropicApiKey } from "./env";
import { CLAUDE_MODEL } from "./claude";
import { getExam } from "./exams";
import { effectiveContent } from "./content-overrides";
import { addressInstruction } from "./address-form";
import { stripNikud, stripTaamim } from "./hebrew";
import { verseByNum, etnachtaSplit } from "./etnachta";
import { TASK_REGISTRY } from "@/content/tasks/registry";
import { VAYIKRA_16 } from "@/content/tasks/vayikra-16-verses";

// Exam preparation for the students, built to match a teacher's exam: a
// map of the chapter, expressions to know (with verses), practice that is
// checked at once (parallel to the exam, never its questions), and an
// argument the student writes and Claude answers briefly. Hidden until the
// teacher publishes it; the exam itself is never exposed — students get the
// prep without its answers, and the answers only through the check API.

export type PrepItemKind = "choice" | "multi" | "verse" | "etnachta" | "short" | "open";
export interface PrepItem {
  id: string;
  kind: PrepItemKind;
  text: string;
  options: string[]; // choice / multi
  correct: string[]; // choice/multi: the right options · verse: accepted verses · short: accepted answers
  explain: string; // shown after a right answer (open: the model answer)
  verseNum?: string; // etnachta: the verse whose word the student picks
  verse?: string; // its text with cantillation (filled by the server)
}
export interface PrepMapPart {
  title: string;
  verses: string;
  summary: string;
}
export interface PrepTerm {
  term: string;
  verses: string;
  note: string;
}
export interface PrepDoc {
  title: string;
  intro: string;
  map: PrepMapPart[];
  terms: PrepTerm[];
  practice: PrepItem[];
  argument: { intro: string; refs: string[] }; // units whose discussion question may be chosen
}
export interface PrepRow {
  id: number;
  examId: number;
  status: "draft" | "published";
  doc: PrepDoc;
  updatedAt: number;
}

// what a student's browser receives: no answers, no exam
export interface StudentPrepItem {
  id: string;
  kind: PrepItemKind;
  text: string;
  options: string[];
  verseNum?: string;
  verse?: string;
}
export interface StudentPrep {
  id: number;
  title: string;
  intro: string;
  examDate: string | null;
  map: PrepMapPart[];
  terms: PrepTerm[];
  practice: StudentPrepItem[];
  argument: { intro: string; questions: { ref: string; unit: string; question: string }[] };
}
export interface PrepArgument {
  ref: string;
  claim: string;
  reason: string;
  evidence: string;
  feedback: string;
}
export interface PrepProgress {
  solved: string[];
  attempts: Record<string, number>;
  argument: PrepArgument | null;
  done: number;
  total: number;
  ready: boolean;
}

export const ARGUMENT_ITEM = "__argument";
export const DEFAULT_ARGUMENT_REFS = ["vayikra-16-1", "vayikra-16-2", "vayikra-16-3", "vayikra-16-5"];
// after this many wrong tries the student may see the answer
export const REVEAL_AFTER = 2;

const now = () => Math.floor(Date.now() / 1000);

let ready = false;
async function ensureTable() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS exam_preps (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       exam_id INTEGER NOT NULL UNIQUE,
       status TEXT NOT NULL DEFAULT 'draft',
       doc_json TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  );
  await db().execute(
    `CREATE TABLE IF NOT EXISTS exam_prep_progress (
       prep_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       item_id TEXT NOT NULL,
       solved INTEGER NOT NULL DEFAULT 0,
       attempts INTEGER NOT NULL DEFAULT 0,
       answer TEXT,
       feedback TEXT,
       updated_at INTEGER NOT NULL,
       PRIMARY KEY (prep_id, user_id, item_id)
     )`
  );
  ready = true;
}

function rowToPrep(r: Record<string, unknown>): PrepRow {
  return {
    id: Number(r.id),
    examId: Number(r.exam_id),
    status: String(r.status) === "published" ? "published" : "draft",
    // older preps (topics / tips / reveal-only questions) are read into the current shape
    doc: sanitizePrep(JSON.parse(String(r.doc_json)) as PrepDoc),
    updatedAt: Number(r.updated_at),
  };
}

export async function getPrepForExam(examId: number): Promise<PrepRow | null> {
  await ensureTable();
  const r = await db().execute({ sql: "SELECT * FROM exam_preps WHERE exam_id = ?", args: [examId] });
  return r.rows[0] ? rowToPrep(r.rows[0] as Record<string, unknown>) : null;
}

export async function getPrep(id: number): Promise<PrepRow | null> {
  await ensureTable();
  const r = await db().execute({ sql: "SELECT * FROM exam_preps WHERE id = ?", args: [id] });
  return r.rows[0] ? rowToPrep(r.rows[0] as Record<string, unknown>) : null;
}

// what students see: published preps only, newest first
export async function listPublishedPreps(): Promise<PrepRow[]> {
  await ensureTable();
  const r = await db().execute("SELECT * FROM exam_preps WHERE status = 'published' ORDER BY updated_at DESC");
  return r.rows.map((x) => rowToPrep(x as Record<string, unknown>));
}

export async function savePrep(examId: number, doc: PrepDoc, status: "draft" | "published"): Promise<PrepRow> {
  await ensureTable();
  const clean = sanitizePrep(doc);
  const t = now();
  await db().execute({
    sql: `INSERT INTO exam_preps (exam_id, status, doc_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(exam_id) DO UPDATE SET status = excluded.status, doc_json = excluded.doc_json, updated_at = excluded.updated_at`,
    args: [examId, status, JSON.stringify(clean), t, t],
  });
  return (await getPrepForExam(examId))!;
}

const KINDS = new Set<PrepItemKind>(["choice", "multi", "verse", "etnachta", "short", "open"]);
let qid = 0;
const freshId = () => `p${Date.now().toString(36)}${(qid++).toString(36)}`;
const strs = (a: unknown, max: number) => (Array.isArray(a) ? a.map((x) => String(x ?? "").slice(0, max)) : []);

export function sanitizeItem(raw: Partial<PrepItem> & { answer?: string }): PrepItem {
  const legacy = !KINDS.has(raw.kind as PrepItemKind);
  // a question from the older prep: etnachta stays etnachta, the rest become open questions
  const kind: PrepItemKind = legacy ? (String(raw.kind) === "etnachta" ? "etnachta" : "open") : (raw.kind as PrepItemKind);
  const item: PrepItem = {
    id: String(raw.id || freshId()).slice(0, 60),
    kind,
    text: String(raw.text ?? "").slice(0, 2000),
    options: kind === "choice" || kind === "multi" ? strs(raw.options, 300) : [],
    correct: strs(raw.correct, 300),
    explain: String(raw.explain ?? (legacy ? raw.answer ?? "" : "")).slice(0, 2000),
  };
  if (kind === "choice" || kind === "multi") item.correct = item.correct.filter((c) => item.options.includes(c));
  if (kind === "choice") item.correct = item.correct.slice(0, 1);
  const num = String(raw.verseNum ?? "").replace(/[״׳"']/g, "").trim();
  if (kind === "etnachta" && num) {
    const verse = verseByNum(num);
    if (verse) {
      item.verseNum = num;
      item.verse = verse;
    }
  }
  return item;
}

export function sanitizePrep(raw: PrepDoc): PrepDoc {
  const r = raw as PrepDoc & { topics?: { unit: string; points: string[] }[]; tips?: { part: string; tip: string }[] };
  const map: PrepMapPart[] = Array.isArray(r.map)
    ? r.map.map((m) => ({ title: String(m.title ?? "").slice(0, 200), verses: String(m.verses ?? "").slice(0, 60), summary: String(m.summary ?? "").slice(0, 800) }))
    : (r.topics ?? []).map((t) => ({ title: String(t.unit ?? "").slice(0, 200), verses: "", summary: (t.points ?? []).join(" · ").slice(0, 800) }));
  const terms: PrepTerm[] = Array.isArray(r.terms)
    ? r.terms.map((t) => ({ term: String(t.term ?? "").slice(0, 200), verses: String(t.verses ?? "").slice(0, 60), note: String(t.note ?? "").slice(0, 400) }))
    : [];
  const tips = (r.tips ?? []).map((t) => `${t.part}: ${t.tip}`).join("\n");
  const refs = Array.isArray(r.argument?.refs) ? r.argument.refs.map(String).filter((x) => TASK_REGISTRY[x]) : DEFAULT_ARGUMENT_REFS;
  return {
    title: String(r.title || "הכנה למבחן").slice(0, 200),
    intro: (String(r.intro || "") + (tips && !Array.isArray(r.map) ? `\n\n${tips}` : "")).slice(0, 3000),
    map,
    terms,
    practice: (r.practice ?? []).map((q) => sanitizeItem(q as PrepItem)),
    argument: {
      intro: String(r.argument?.intro || "בחרו אחת משאלות הדיון, וכתבו טענה, נימוק וביסוס (ציטוט ומספר פסוק).").slice(0, 1000),
      refs,
    },
  };
}

// ---------------------------------------------------------- students ----
// the units whose discussion question the teacher may offer for the argument practice
export const CHAPTER_UNIT_REFS = ["vayikra-16-1", "vayikra-16-2", "vayikra-16-3", "vayikra-16-4", "vayikra-16-5"];

export async function discussionQuestions(refs: string[]) {
  const out: { ref: string; unit: string; question: string }[] = [];
  for (const ref of refs) {
    const reg = TASK_REGISTRY[ref];
    if (!reg) continue;
    const c = await effectiveContent(reg.content);
    if (c.discussion?.question) out.push({ ref, unit: c.title, question: c.discussion.question });
  }
  return out;
}

export async function studentView(prep: PrepRow): Promise<StudentPrep> {
  const exam = await getExam(prep.examId);
  return {
    id: prep.id,
    title: prep.doc.title,
    intro: prep.doc.intro,
    examDate: exam?.doc.examDate ?? null,
    map: prep.doc.map,
    terms: prep.doc.terms,
    practice: prep.doc.practice.map((q) => ({ id: q.id, kind: q.kind, text: q.text, options: q.options.filter((o) => o.trim()), verseNum: q.verseNum, verse: q.verse })),
    argument: { intro: prep.doc.argument.intro, questions: await discussionQuestions(prep.doc.argument.refs) },
  };
}

export async function examDateOf(prep: PrepRow): Promise<string | null> {
  return (await getExam(prep.examId))?.doc.examDate ?? null;
}

const totalOf = (doc: PrepDoc) => doc.practice.length + (doc.argument.refs.length > 0 ? 1 : 0);

export async function progressFor(prep: PrepRow, userId: number): Promise<PrepProgress> {
  await ensureTable();
  const r = await db().execute({ sql: "SELECT item_id, solved, attempts, answer, feedback FROM exam_prep_progress WHERE prep_id = ? AND user_id = ?", args: [prep.id, userId] });
  const ids = new Set(prep.doc.practice.map((q) => q.id));
  const solved: string[] = [];
  const attempts: Record<string, number> = {};
  let argument: PrepArgument | null = null;
  for (const row of r.rows) {
    const id = String(row.item_id);
    if (id === ARGUMENT_ITEM) {
      try {
        argument = { ...(JSON.parse(String(row.answer ?? "{}")) as Omit<PrepArgument, "feedback">), feedback: String(row.feedback ?? "") };
      } catch {
        argument = null;
      }
      continue;
    }
    if (!ids.has(id)) continue;
    attempts[id] = Number(row.attempts);
    if (Number(row.solved)) solved.push(id);
  }
  const total = totalOf(prep.doc);
  const done = solved.length + (argument && prep.doc.argument.refs.length > 0 ? 1 : 0);
  return { solved, attempts, argument, done, total, ready: total > 0 && done >= total };
}

// explanations the student already earned (questions she answered right)
export function earnedExplains(prep: PrepRow, progress: PrepProgress): Record<string, string> {
  const solved = new Set(progress.solved);
  return Object.fromEntries(prep.doc.practice.filter((q) => solved.has(q.id)).map((q) => [q.id, q.explain]));
}

// the published preps as cards (/tasks, /me): title, exam date, her progress
export async function prepCardsFor(userId: number): Promise<{ id: number; title: string; examDate: string | null; done: number; total: number; ready: boolean }[]> {
  const preps = await listPublishedPreps();
  return Promise.all(
    preps.map(async (p) => {
      const pr = await progressFor(p, userId);
      return { id: p.id, title: p.doc.title, examDate: await examDateOf(p), done: pr.done, total: pr.total, ready: pr.ready };
    })
  );
}

// Hebrew verse number → 1..176 ("י״ט", "יט", "19", "פסוק יט")
const LETTER: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100 };
export function parseVerseNum(s: string): number | null {
  const t = stripNikud(String(s)).replace(/פסוקים|פסוק|פס['׳]?/g, "").replace(/[״׳"'\s.]/g, "");
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  let n = 0;
  for (const ch of t) {
    if (!(ch in LETTER)) return null;
    n += LETTER[ch];
  }
  return n || null;
}

const norm = (s: string) =>
  stripNikud(String(s))
    .replace(/[־\-–—]/g, " ")
    .replace(/[״׳"'`.,;:!?()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function isCorrect(item: PrepItem, answer: unknown): boolean {
  switch (item.kind) {
    case "choice":
      return item.correct.includes(String(answer ?? ""));
    case "multi": {
      const picked = new Set(Array.isArray(answer) ? answer.map(String) : []);
      return item.correct.length > 0 && picked.size === item.correct.length && item.correct.every((c) => picked.has(c));
    }
    case "verse": {
      const n = parseVerseNum(String(answer ?? ""));
      return n != null && item.correct.some((c) => parseVerseNum(c) === n);
    }
    case "etnachta": {
      if (!item.verse) return false;
      const words = item.verse.split(/\s+/);
      const i = Number(answer);
      const split = etnachtaSplit(item.verse);
      return Number.isInteger(i) && split != null && words[i] === split.word;
    }
    case "short": {
      const a = norm(String(answer ?? ""));
      return a.length > 0 && item.correct.some((c) => {
        const n = norm(c);
        return n.length > 0 && (a === n || (n.length >= 2 && a.includes(n)));
      });
    }
    case "open":
      return String(answer ?? "").trim().length >= 3;
  }
}

function answerText(item: PrepItem): string {
  if (item.kind === "etnachta" && item.verse) return `האתנחתא במילה ״${etnachtaSplit(item.verse)?.word ?? ""}״`;
  if (item.kind === "verse") return item.correct.map((c) => `פסוק ${c}`).join(" או ");
  if (item.kind === "open") return "";
  return item.correct.join(" · ");
}

export async function checkAnswer(
  prep: PrepRow,
  userId: number,
  itemId: string,
  answer: unknown,
  reveal: boolean
): Promise<{ correct: boolean; explain: string; answer: string; attempts: number; progress: PrepProgress } | { error: string }> {
  await ensureTable();
  const item = prep.doc.practice.find((q) => q.id === itemId);
  if (!item) return { error: "השאלה לא נמצאה" };
  const prev = await db().execute({ sql: "SELECT solved, attempts FROM exam_prep_progress WHERE prep_id = ? AND user_id = ? AND item_id = ?", args: [prep.id, userId, itemId] });
  const wasSolved = Number(prev.rows[0]?.solved ?? 0) === 1;
  const attemptsBefore = Number(prev.rows[0]?.attempts ?? 0);
  if (reveal) {
    if (attemptsBefore < REVEAL_AFTER && !wasSolved) return { error: `אפשר לראות את התשובה אחרי ${REVEAL_AFTER} ניסיונות` };
    return { correct: false, explain: item.explain, answer: answerText(item), attempts: attemptsBefore, progress: await progressFor(prep, userId) };
  }
  const correct = isCorrect(item, answer);
  const attempts = attemptsBefore + 1;
  await db().execute({
    sql: `INSERT INTO exam_prep_progress (prep_id, user_id, item_id, solved, attempts, answer, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(prep_id, user_id, item_id) DO UPDATE SET solved = MAX(solved, excluded.solved), attempts = excluded.attempts, answer = excluded.answer, updated_at = excluded.updated_at`,
    args: [prep.id, userId, itemId, correct ? 1 : 0, attempts, JSON.stringify(answer ?? null).slice(0, 2000), now()],
  });
  return {
    correct,
    explain: correct ? item.explain : "",
    answer: correct ? answerText(item) : "",
    attempts,
    progress: await progressFor(prep, userId),
  };
}

// ---------------------------------------------------- argument feedback ----
const ARGUMENT_SYSTEM = `את/ה עוזר/ת לימוד באתר "קדושים תהיו" (תנ"ך, כיתה ט, בנים ובנות). תלמיד/ה מתכונן/ת למבחן על ויקרא ט"ז וכתב/ה טיעון על אחת משאלות הדיון: טענה, נימוק וביסוס.
העיקרון: "אני עשיתי לבד אבל לא פגשתי קיר" — לא כותבים את הטיעון במקומם.
תן/י משוב קצר ומעודד, עד 4 משפטים קצרים, טקסט רגיל בלי Markdown:
- האם הטענה ברורה ועונה על השאלה שנבחרה.
- האם הנימוק באמת מסביר את הטענה.
- האם הביסוס מדויק: ציטוט מהפרק ומספר הפסוק הנכון (בדוק/בדקי מול הפסוקים שלמטה; אם המספר לא נכון — אמור/אמרי זאת ורמוז/רמזי איפה לחפש, בלי לתת את המספר).
- הצעה אחת לשיפור — למשל להתייחס לצד השני.
במבחן הניקוד: טענה ברורה, נימוק, ביסוס מדויק, התייחסות לצד השני — אפשר להזכיר את זה כדי לכוון.
{ADDRESS_RULE}`;

export async function argumentFeedback(
  prep: PrepRow,
  user: { id: number; addressForm?: string | null; fullName?: string | null },
  input: { ref: string; claim: string; reason: string; evidence: string }
): Promise<{ feedback: string; progress: PrepProgress } | { error: string; status?: number }> {
  await ensureTable();
  if (!prep.doc.argument.refs.includes(input.ref)) return { error: "שאלת הדיון לא נמצאה" };
  const question = (await discussionQuestions([input.ref]))[0];
  if (!question) return { error: "שאלת הדיון לא נמצאה" };
  if (!input.claim.trim() || !input.reason.trim() || !input.evidence.trim()) return { error: "צריך למלא טענה, נימוק וביסוס" };
  // the same daily ceiling as the worksheet help (assist_log)
  const used = await db().execute({ sql: "SELECT COUNT(*) AS n FROM assist_log WHERE user_id = ? AND created_at > ?", args: [user.id, now() - 24 * 3600] });
  if (Number(used.rows[0]?.n ?? 0) >= 20) return { error: "הגעת למכסת העזרה מקלוד להיום — היא מתאפסת מחר.", status: 429 };
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return { error: "המשוב מקלוד עוד לא חובר.", status: 503 };
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const verses = VAYIKRA_16.map((v) => `(${v.num}) ${stripTaamim(v.text)}`).join("\n");
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: [
      { type: "text", text: `ויקרא ט"ז:\n${verses}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: ARGUMENT_SYSTEM.replace("{ADDRESS_RULE}", addressInstruction(user.addressForm)) },
    ],
    messages: [
      {
        role: "user",
        content: `שאלת הדיון (${question.unit}): ${question.question}\n\nטענה: ${input.claim}\nנימוק: ${input.reason}\nביסוס: ${input.evidence}`,
      },
    ],
  });
  const feedback = msg.content.find((c): c is Anthropic.TextBlock => c.type === "text")?.text?.trim() || "קיבלתי. נסו לבדוק שהציטוט ומספר הפסוק מדויקים.";
  const t = now();
  await db().execute({
    sql: `INSERT INTO exam_prep_progress (prep_id, user_id, item_id, solved, attempts, answer, feedback, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?, ?)
          ON CONFLICT(prep_id, user_id, item_id) DO UPDATE SET solved = 1, attempts = attempts + 1, answer = excluded.answer, feedback = excluded.feedback, updated_at = excluded.updated_at`,
    args: [prep.id, user.id, ARGUMENT_ITEM, JSON.stringify(input).slice(0, 6000), feedback, t],
  });
  await db().execute({
    sql: "INSERT INTO assist_log (user_id, task_id, context, student_input, claude_reply, created_at) VALUES (?, NULL, ?, ?, ?, ?)",
    args: [user.id, `[exam-prep-argument] ${question.question}`.slice(0, 480), `${input.claim}\n${input.reason}\n${input.evidence}`.slice(0, 1000), feedback, t],
  });
  return { feedback, progress: await progressFor(prep, user.id) };
}

// ------------------------------------------------------------- teacher ----
export interface PrepStudentRow {
  userId: number;
  name: string;
  klass: string | null;
  done: number;
  total: number;
  ready: boolean;
  argument: boolean;
  lastAt: number | null;
}

// who started / finished the preparation — for the teacher only
export async function prepClassProgress(prep: PrepRow): Promise<{ students: PrepStudentRow[]; started: number; completed: number; total: number }> {
  await ensureTable();
  const { allStudents } = await import("./tasks");
  const students = await allStudents();
  const r = await db().execute({ sql: "SELECT user_id, item_id, solved, updated_at FROM exam_prep_progress WHERE prep_id = ?", args: [prep.id] });
  const ids = new Set(prep.doc.practice.map((q) => q.id));
  const hasArg = prep.doc.argument.refs.length > 0;
  const total = totalOf(prep.doc);
  const by = new Map<number, { done: number; argument: boolean; lastAt: number; touched: boolean }>();
  for (const row of r.rows) {
    const uid = Number(row.user_id);
    const cur = by.get(uid) ?? { done: 0, argument: false, lastAt: 0, touched: false };
    const id = String(row.item_id);
    cur.touched = true;
    cur.lastAt = Math.max(cur.lastAt, Number(row.updated_at));
    if (id === ARGUMENT_ITEM) {
      if (hasArg) {
        cur.argument = true;
        cur.done++;
      }
    } else if (ids.has(id) && Number(row.solved)) cur.done++;
    by.set(uid, cur);
  }
  const rows = students.map((s) => {
    const p = by.get(s.id);
    return { userId: s.id, name: s.fullName, klass: s.klass, done: p?.done ?? 0, total, ready: total > 0 && (p?.done ?? 0) >= total, argument: p?.argument ?? false, lastAt: p?.touched ? p.lastAt : null };
  });
  return { students: rows, started: rows.filter((x) => x.lastAt != null).length, completed: rows.filter((x) => x.ready).length, total };
}

// ---------------------------------------- edits by operation (the chat) ----
export type PrepItemOp =
  | ({ op: "update"; itemId: string } & Partial<Omit<PrepItem, "id">>)
  | ({ op: "add"; position?: number } & Partial<Omit<PrepItem, "id">>)
  | { op: "delete"; itemId: string }
  | { op: "move"; itemId: string; position: number };
export interface PrepPatch {
  title?: string;
  intro?: string;
  map?: PrepMapPart[];
  terms?: PrepTerm[];
  argumentIntro?: string;
  argumentRefs?: string[];
  practiceOps?: PrepItemOp[];
}

export function applyPrepPatch(doc: PrepDoc, patch: PrepPatch): PrepDoc {
  const next: PrepDoc = JSON.parse(JSON.stringify(doc));
  if (typeof patch.title === "string") next.title = patch.title;
  if (typeof patch.intro === "string") next.intro = patch.intro;
  if (Array.isArray(patch.map)) next.map = patch.map;
  if (Array.isArray(patch.terms)) next.terms = patch.terms;
  if (typeof patch.argumentIntro === "string") next.argument.intro = patch.argumentIntro;
  if (Array.isArray(patch.argumentRefs)) next.argument.refs = patch.argumentRefs;
  const find = (id: string) => {
    const i = next.practice.findIndex((q) => q.id === id);
    if (i < 0) throw new Error(`שאלת התרגול ${id} לא נמצאה`);
    return i;
  };
  const at = (position?: number) => (position == null ? next.practice.length : Math.min(Math.max(0, Math.round(position) - 1), next.practice.length));
  for (const op of patch.practiceOps ?? []) {
    if (op.op === "update") {
      const i = find(op.itemId);
      const { op: _op, itemId: _id, ...fields } = op;
      void _op;
      void _id;
      next.practice[i] = sanitizeItem({ ...next.practice[i], ...fields });
    } else if (op.op === "add") {
      const { op: _op, position, ...fields } = op;
      void _op;
      next.practice.splice(at(position), 0, sanitizeItem({ kind: "choice", ...fields }));
    } else if (op.op === "delete") {
      next.practice.splice(find(op.itemId), 1);
    } else if (op.op === "move") {
      const [q] = next.practice.splice(find(op.itemId), 1);
      next.practice.splice(at(op.position), 0, q);
    }
  }
  return sanitizePrep(next);
}

// ------------------------------------------------- Claude drafts a prep ----
const PREP_TOOL: Anthropic.Tool = {
  name: "propose_prep",
  description: "דף ההכנה למבחן",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      map: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, verses: { type: "string" }, summary: { type: "string" } },
          required: ["title", "verses", "summary"],
          additionalProperties: false,
        },
      },
      terms: {
        type: "array",
        items: {
          type: "object",
          properties: { term: { type: "string" }, verses: { type: "string" }, note: { type: "string" } },
          required: ["term", "verses", "note"],
          additionalProperties: false,
        },
      },
      practice: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["choice", "multi", "verse", "etnachta", "short"] },
            text: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correct: { type: "array", items: { type: "string" } },
            explain: { type: "string" },
            verseNum: { type: "string", description: "רק ל-etnachta: מספר הפסוק באותיות; אחרת מחרוזת ריקה" },
          },
          required: ["kind", "text", "options", "correct", "explain", "verseNum"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "intro", "map", "terms", "practice"],
    additionalProperties: false,
  },
  strict: true,
};

const PREP_SYSTEM = `אתה כותב לתלמידי כיתה ט (בנים ובנות) דף הכנה למבחן בתנ"ך על ויקרא ט"ז — עבודת יום הכיפורים, בתיכון שחרית.
תקבל את המבחן עצמו (סודי! אסור לחשוף אף שאלה ממנו, לא בניסוח ולא ברמז ישיר) ואת הפסוקים. הדף מכין לאותן מיומנויות ולאותם נושאים, בלי לחזור על שאלות המבחן.
פשט בלבד, מתוך הפסוקים; עברית ברורה ומעודדת.

מה לכתוב:
- title: "הכנה למבחן — ויקרא ט"ז". intro: 2–3 משפטים חמים: מה יש בדף ואיך להשתמש בו.
- map: חמשת חלקי הפרק לפי הסדר (ההכנות והכניסה לקודש א׳–ו׳; שני השעירים והגורלות ז׳–י׳; עבודת הפנים י״א–י״ט; השעיר המשתלח וסיום העבודה כ׳–כ״ח; חוקת עולם כ״ט–ל״ד). verses = טווח הפסוקים; summary = משפט אחד.
- terms: 8–10 ביטויים שחייבים להכיר, עם ניקוד, מספר הפסוק (verses) והסבר קצר (note).
- practice: 10–12 שאלות שנבדקות אוטומטית, מקבילות למבחן ולא זהות לו:
  choice = בחירה אחת (options; correct = האפשרות הנכונה, מילה במילה), multi = סמנו את כל הנכונות (correct = כל הנכונות), verse = "באיזה פסוק מופיע…" (correct = מספרי הפסוקים באותיות, למשל "יד"), etnachta = התלמיד לוחץ על מילת האתנחתא בפסוק (verseNum; פסוקים שאינם במבחן), short = תשובה של מילה או שתיים (correct = הנוסחים המתקבלים).
  explain: משפט שמסביר את התשובה, עם ציטוט ומספר פסוק.
החזר אך ורק דרך הכלי propose_prep.`;

export async function generatePrep(examId: number): Promise<PrepRow> {
  const exam = await getExam(examId);
  if (!exam) throw new Error("המבחן לא נמצא");
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new Error("מפתח Claude לא מוגדר.");
  const client = new Anthropic({ apiKey, timeout: 600_000, maxRetries: 1 });
  const verses = VAYIKRA_16.map((v) => `(${v.num}) ${v.text}`).join("\n");
  const examText = exam.doc.sections
    .map((s) => `## ${s.title} (key=${s.key})\n${s.questions.map((q) => `- ${q.text}${q.verseNum ? ` [פסוק ${q.verseNum}]` : ""}`).join("\n")}`)
    .join("\n");
  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: PREP_SYSTEM }],
    tools: [PREP_TOOL],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: `הפרק:\n${verses}\n\nהמבחן (סודי, רק כדי לדעת למה להכין):\n${examText}\n\nכתוב את דף ההכנה.` }],
  });
  const tool = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  let input = tool?.input as PrepDoc | undefined;
  if (!input) {
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ");
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        input = JSON.parse(m[0]) as PrepDoc;
      } catch {
        input = undefined;
      }
    }
  }
  if (!input || !Array.isArray(input.practice)) throw new Error(`קלוד לא החזיר הכנה (${msg.stop_reason ?? "?"}) — נסי שוב.`);
  const existing = await getPrepForExam(examId);
  // a new draft keeps the argument part the teacher chose, and is never published by itself
  return savePrep(examId, { ...input, argument: existing?.doc.argument ?? { intro: "", refs: DEFAULT_ARGUMENT_REFS } }, "draft");
}
