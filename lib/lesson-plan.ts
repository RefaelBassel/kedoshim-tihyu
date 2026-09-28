import { db } from "./db";
import { taskOrderIndex, positionLabel } from "@/content/tasks/registry";

// מתכנן השיעור — today's lesson as an ordered list of blocks the teacher
// composes in two taps: review / debate / study, each on a unit. The order
// is hers (a double lesson may hold two debates); the site never enforces
// one. Once started, a thin strip on every teacher page says what is
// happening now and what comes next, and opens the right tool in one click.

export type BlockKind = "review" | "discussion" | "study";
export interface PlanBlock {
  kind: BlockKind;
  taskId: number;
  title: string;
}
export interface LessonPlan {
  day: string; // YYYY-MM-DD in Israel
  blocks: PlanBlock[];
  current: number; // -1 = not started
  startedAt: number | null;
}

const now = () => Math.floor(Date.now() / 1000);

export function todayIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

let ready = false;
export async function ensurePlanTable() {
  if (ready) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS lesson_plans (
       day TEXT PRIMARY KEY,
       blocks_json TEXT NOT NULL,
       current_index INTEGER NOT NULL DEFAULT -1,
       started_at INTEGER,
       updated_by INTEGER,
       updated_at INTEGER NOT NULL
     )`
  );
  ready = true;
}

export async function getPlan(day = todayIsrael()): Promise<LessonPlan> {
  await ensurePlanTable();
  const res = await db().execute({ sql: "SELECT * FROM lesson_plans WHERE day = ?", args: [day] });
  const r = res.rows[0];
  if (!r) return { day, blocks: [], current: -1, startedAt: null };
  let blocks: PlanBlock[] = [];
  try {
    blocks = JSON.parse(String(r.blocks_json));
  } catch {
    blocks = [];
  }
  return {
    day,
    blocks,
    current: Number(r.current_index),
    startedAt: r.started_at != null ? Number(r.started_at) : null,
  };
}

export async function savePlan(blocks: PlanBlock[], teacherId: number, day = todayIsrael()) {
  await ensurePlanTable();
  const existing = await getPlan(day);
  const current = Math.min(existing.current, blocks.length - 1);
  await db().execute({
    sql: `INSERT INTO lesson_plans (day, blocks_json, current_index, started_at, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(day) DO UPDATE SET blocks_json = excluded.blocks_json,
            current_index = excluded.current_index, updated_by = excluded.updated_by,
            updated_at = excluded.updated_at`,
    args: [day, JSON.stringify(blocks.slice(0, 12)), current, existing.startedAt, teacherId, now()],
  });
}

export async function setCurrent(index: number, day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  const i = Math.max(-1, Math.min(plan.blocks.length - 1, index));
  await db().execute({
    sql: `UPDATE lesson_plans SET current_index = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE day = ?`,
    args: [i, i >= 0 ? now() : null, now(), day],
  });
}

export async function stopPlan(day = todayIsrael()) {
  await ensurePlanTable();
  await db().execute({
    sql: "UPDATE lesson_plans SET current_index = -1, started_at = NULL, updated_at = ? WHERE day = ?",
    args: [now(), day],
  });
}

// Published tasks in curriculum order — the picker's options, plus a
// sensible default: debate/review on the latest unit that has a successor,
// study on the newest.
export async function plannerOptions() {
  const res = await db().execute({ sql: "SELECT id, content_ref, title FROM tasks", args: [] });
  const tasks = res.rows
    .map((r) => ({
      id: Number(r.id),
      ref: String(r.content_ref),
      title: String(r.title),
      position: positionLabel(String(r.content_ref)),
    }))
    .sort((a, b) => taskOrderIndex(a.ref) - taskOrderIndex(b.ref));
  return tasks;
}
