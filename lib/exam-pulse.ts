import { db } from "./db";
import { getExam, listExams, type ExamRow } from "./exams";
import { ARGUMENT_ITEM, getPrepForExam, prepClassProgress } from "./exam-prep";
import { allStudents, ensureCancellationsTable, now } from "./tasks";
import { daysUntil } from "./prep-shared";
import { taskOrderIndex } from "@/content/tasks/registry";

// "דופק כיתה" — where the whole class stands before an exam: the prep page
// (started / progress / first-try right) and the chapter's review tasks,
// weighted into one readiness score. Teacher only; every caller checks the role.

export const PREP_WEIGHT = 0.5; // the rest is the chapter tasks
export const isChapterTaskRef = (ref: string) => ref.startsWith("vayikra-16-") || ref === "mikdash-live";

export type PulseTaskState = "none" | "progress" | "submitted";
export interface PulseTask {
  id: number;
  title: string;
}
export interface PulseStudent {
  userId: number;
  name: string;
  klass: string | null;
  prepStatus: "none" | "progress" | "done";
  prepPct: number;
  firstTry: number;
  lastAt: number | null;
  tasks: { state: PulseTaskState; pct: number }[];
  tasksPct: number;
  readiness: number;
}
export interface PulseHardItem {
  id: string;
  text: string;
  tried: number;
  firstTryRate: number; // 0-100
}
export interface ExamPulse {
  examId: number;
  title: string;
  examDate: string | null;
  daysLeft: number | null;
  hasPrep: boolean;
  prepPublished: boolean;
  practiceCount: number;
  tasks: PulseTask[];
  students: PulseStudent[];
  started: number;
  completed: number;
  avgPrepPct: number;
  hardItems: PulseHardItem[];
  generatedAt: number;
}

// an exam is "upcoming" while its date is ahead or its prep page is published
export async function upcomingExams(): Promise<ExamRow[]> {
  const exams = await listExams();
  const out: ExamRow[] = [];
  for (const e of exams) {
    const d = daysUntil(e.doc.examDate);
    if (d != null && d >= 0) out.push(e);
    else if ((await getPrepForExam(e.id))?.status === "published") out.push(e);
  }
  return out;
}

export async function examPulse(examId: number): Promise<ExamPulse | null> {
  const exam = await getExam(examId);
  if (!exam) return null;
  const prep = await getPrepForExam(exam.id);
  const students = await allStudents();

  // the prep page
  const prepClass = prep ? await prepClassProgress(prep) : null;
  const prepBy = new Map(prepClass?.students.map((s) => [s.userId, s]) ?? []);
  const firstTryBy = new Map<number, number>();
  const hardItems: PulseHardItem[] = [];
  if (prep) {
    const r = await db().execute({ sql: "SELECT user_id, item_id, solved, attempts FROM exam_prep_progress WHERE prep_id = ?", args: [prep.id] });
    const studentIds = new Set(students.map((s) => s.id));
    const stats = new Map<string, { tried: number; first: number }>();
    for (const row of r.rows) {
      const uid = Number(row.user_id);
      const id = String(row.item_id);
      if (id === ARGUMENT_ITEM || !studentIds.has(uid)) continue;
      const attempts = Number(row.attempts);
      if (attempts < 1) continue;
      // a solved item is locked, so solved with one attempt = right the first time
      const first = Number(row.solved) === 1 && attempts === 1;
      if (first) firstTryBy.set(uid, (firstTryBy.get(uid) ?? 0) + 1);
      const s = stats.get(id) ?? { tried: 0, first: 0 };
      s.tried++;
      if (first) s.first++;
      stats.set(id, s);
    }
    // open questions are accepted for any answer — they say nothing about difficulty
    for (const q of prep.doc.practice) {
      const s = stats.get(q.id);
      if (q.kind === "open" || !s || s.tried === 0) continue;
      hardItems.push({ id: q.id, text: q.text, tried: s.tried, firstTryRate: Math.round((100 * s.first) / s.tried) });
    }
    hardItems.sort((a, b) => a.firstTryRate - b.firstTryRate || b.tried - a.tried);
  }

  // the chapter's published, not-cancelled tasks, in curriculum order
  await ensureCancellationsTable();
  const tr = await db().execute({
    sql: `SELECT id, content_ref, title FROM tasks
          WHERE published_at <= ? AND id NOT IN (SELECT task_id FROM task_cancellations)`,
    args: [now()],
  });
  const tasks = tr.rows
    .filter((t) => isChapterTaskRef(String(t.content_ref)))
    .sort((a, b) => taskOrderIndex(String(a.content_ref)) - taskOrderIndex(String(b.content_ref)) || Number(a.id) - Number(b.id))
    .map((t) => ({ id: Number(t.id), title: String(t.title) }));
  const progress = new Map<string, { state: PulseTaskState; pct: number }>();
  if (tasks.length > 0) {
    const pr = await db().execute({
      sql: `SELECT task_id, user_id, opened_at, progress_pct, submitted_at FROM task_progress
            WHERE task_id IN (${tasks.map(() => "?").join(",")})`,
      args: tasks.map((t) => t.id),
    });
    for (const p of pr.rows) {
      const submitted = p.submitted_at != null;
      const state: PulseTaskState = submitted ? "submitted" : p.opened_at != null ? "progress" : "none";
      progress.set(`${p.task_id}:${p.user_id}`, { state, pct: submitted ? 100 : Math.max(0, Math.min(100, Number(p.progress_pct ?? 0))) });
    }
  }

  const rows: PulseStudent[] = students.map((s) => {
    const p = prepBy.get(s.id);
    const prepPct = p && p.total > 0 ? Math.round((100 * Math.min(p.done, p.total)) / p.total) : 0;
    const prepStatus: PulseStudent["prepStatus"] = !p || p.lastAt == null ? "none" : p.ready ? "done" : "progress";
    const ts = tasks.map((t) => progress.get(`${t.id}:${s.id}`) ?? { state: "none" as const, pct: 0 });
    const tasksPct = ts.length ? Math.round(ts.reduce((a, t) => a + t.pct, 0) / ts.length) : 0;
    const readiness = prep && ts.length ? Math.round(PREP_WEIGHT * prepPct + (1 - PREP_WEIGHT) * tasksPct) : prep ? prepPct : tasksPct;
    return { userId: s.id, name: s.fullName, klass: s.klass, prepStatus, prepPct, firstTry: firstTryBy.get(s.id) ?? 0, lastAt: p?.lastAt ?? null, tasks: ts, tasksPct, readiness };
  });

  return {
    examId: exam.id,
    title: exam.title,
    examDate: exam.doc.examDate ?? null,
    daysLeft: daysUntil(exam.doc.examDate),
    hasPrep: prep != null,
    prepPublished: prep?.status === "published",
    practiceCount: prep?.doc.practice.length ?? 0,
    tasks,
    students: rows,
    started: rows.filter((r) => r.prepStatus !== "none").length,
    completed: rows.filter((r) => r.prepStatus === "done").length,
    avgPrepPct: rows.length ? Math.round(rows.reduce((a, r) => a + r.prepPct, 0) / rows.length) : 0,
    hardItems: hardItems.slice(0, 5),
    generatedAt: now(),
  };
}
