import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getAnthropicApiKey } from "./env";
import { CLAUDE_MODEL } from "./claude";
import { completeQuestion, getExam } from "./exams";
import { VAYIKRA_16 } from "@/content/tasks/vayikra-16-verses";

// Exam preparation for the students, derived from a teacher's exam: the
// topics to review per unit, how to prepare for each part, and practice
// questions PARALLEL to the exam (same skills, never the same questions)
// with answers the student reveals to check herself. Hidden until the
// teacher publishes it; the exam itself is never exposed.

export interface PrepTopic {
  unit: string;
  points: string[];
}
export interface PrepQuestion {
  id: string;
  kind: "pshat" | "etnachta" | "quotes" | "study" | "argument";
  text: string;
  answer: string;
  verseNum?: string;
  verse?: string;
}
export interface PrepDoc {
  title: string;
  intro: string;
  topics: PrepTopic[];
  tips: { part: string; tip: string }[];
  practice: PrepQuestion[];
}
export interface PrepRow {
  id: number;
  examId: number;
  status: "draft" | "published";
  doc: PrepDoc;
  updatedAt: number;
}

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
  ready = true;
}

function rowToPrep(r: Record<string, unknown>): PrepRow {
  return {
    id: Number(r.id),
    examId: Number(r.exam_id),
    status: String(r.status) === "published" ? "published" : "draft",
    doc: JSON.parse(String(r.doc_json)) as PrepDoc,
    updatedAt: Number(r.updated_at),
  };
}

export async function getPrepForExam(examId: number): Promise<PrepRow | null> {
  await ensureTable();
  const r = await db().execute({ sql: "SELECT * FROM exam_preps WHERE exam_id = ?", args: [examId] });
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

const KINDS = new Set(["pshat", "etnachta", "quotes", "study", "argument"]);
let qid = 0;
const freshId = () => `p${Date.now().toString(36)}${(qid++).toString(36)}`;

export function sanitizePrep(raw: PrepDoc): PrepDoc {
  return {
    title: String(raw.title || "הכנה למבחן").slice(0, 200),
    intro: String(raw.intro || "").slice(0, 2000),
    topics: (raw.topics ?? []).map((t) => ({
      unit: String(t.unit || "").slice(0, 200),
      points: (t.points ?? []).map((p) => String(p).slice(0, 300)).filter(Boolean),
    })),
    tips: (raw.tips ?? []).map((t) => ({ part: String(t.part || "").slice(0, 120), tip: String(t.tip || "").slice(0, 800) })),
    practice: (raw.practice ?? []).map((q) => {
      const kind = KINDS.has(String(q.kind)) ? (String(q.kind) as PrepQuestion["kind"]) : "pshat";
      const base = completeQuestion(kind, { id: q.id || freshId(), text: q.text, points: 0, answer: q.answer, verseNum: q.verseNum });
      return { id: base.id, kind, text: base.text, answer: base.answer, verseNum: base.verseNum, verse: base.verse };
    }),
  };
}

const PREP_TOOL: Anthropic.Tool = {
  name: "propose_prep",
  description: "חוברת ההכנה למבחן",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: { unit: { type: "string" }, points: { type: "array", items: { type: "string" } } },
          required: ["unit", "points"],
          additionalProperties: false,
        },
      },
      tips: {
        type: "array",
        items: {
          type: "object",
          properties: { part: { type: "string" }, tip: { type: "string" } },
          required: ["part", "tip"],
          additionalProperties: false,
        },
      },
      practice: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["pshat", "etnachta", "quotes", "study", "argument"] },
            text: { type: "string" },
            answer: { type: "string" },
            verseNum: { type: "string", description: "רק ל-etnachta: מספר הפסוק באות עברית; אחרת מחרוזת ריקה" },
          },
          required: ["kind", "text", "answer", "verseNum"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "intro", "topics", "tips", "practice"],
    additionalProperties: false,
  },
  strict: true,
};

const PREP_SYSTEM = `אתה כותב לתלמידי כיתה ט (בנים ובנות) חוברת הכנה למבחן בתנ"ך על ויקרא ט"ז — עבודת יום הכיפורים, בתיכון שחרית.
תקבל את המבחן עצמו (סודי! אסור לחשוף אף שאלה ממנו, לא בניסוח ולא ברמז ישיר) ואת הפסוקים. החוברת מכינה לאותן מיומנויות ולאותם נושאים, בלי לחזור על שאלות המבחן.
פשט בלבד, מתוך הפסוקים; עברית ברורה ומעודדת, בלי שום לחץ.

מה לכתוב:
- title: "הכנה למבחן — ויקרא ט"ז". intro: 3–4 משפטים חמים: מה יהיה במבחן (סוגי השאלות, בלי הנוסח), איך להתכונן, ושלימוד הפסוקים עצמם הוא הדרך.
- topics: בדיוק חמישה פריטים, אחד לכל יחידה לפי סדר הפרק (unit = שם היחידה: 1 ״הכניסה לקודש ושני השעירים״ א׳–י׳; 2 ״עבודת הפנים״ י״א–י״ט; 3 ״השעיר המשתלח וסיום העבודה״ כ׳–כ״ח; 4 ״חוקת עולם״ כ״ט–ל״ד; 5 ״מפת הפרק כולו״), ובכל אחד 4–6 נקודות "לדעת" קצרות וקונקרטיות עם מספרי פסוקים. לא לארגן לפי חלקי המבחן — לזה יש tips.
- tips: לכל חלק במבחן עצה אחת מעשית איך מתכוננים (למשל לאתנחתא: לקרוא את הפסוק בקול, לחפש את הסימן מתחת למילה, לבדוק אם החלוקה מפרידה בין פעולה לתוצאה). part = שם החלק.
- practice: 14 שאלות תרגול עם תשובות מלאות לבדיקה עצמית: 4 pshat, 4 etnachta (כל אחת על פסוק אחר מהמבחן! בחר פסוקים שלא מופיעים במבחן, ציין verseNum), 2 quotes, 3 study, 1 argument. השאלות מקבילות למבחן ולא זהות לו.
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
    messages: [{ role: "user", content: `הפרק:\n${verses}\n\nהמבחן (סודי, רק כדי לדעת למה להכין):\n${examText}\n\nכתוב את חוברת ההכנה.` }],
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
  return savePrep(examId, input, existing?.status === "published" ? "draft" : "draft");
}

