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

// ---- what was done to a unit: review shown / debate held / study block run ----
// The journey's "already done" colours come from here (plus completion and
// closed debates). A block counts as done when the teacher moves past it.
let eventsReady = false;
export async function ensureEventsTable() {
  if (eventsReady) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS unit_events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       task_id INTEGER NOT NULL,
       kind TEXT NOT NULL,            -- 'review' | 'discussion' | 'study'
       created_at INTEGER NOT NULL,
       source TEXT NOT NULL DEFAULT 'lesson' -- 'lesson' | 'manual'
     )`
  );
  const info = await db().execute("PRAGMA table_info(unit_events)");
  if (!info.rows.some((r) => String(r.name) === "source")) {
    await db().execute("ALTER TABLE unit_events ADD COLUMN source TEXT NOT NULL DEFAULT 'lesson'");
  }
  eventsReady = true;
}

export type EventSource = "lesson" | "manual";
export async function recordUnitEvent(taskId: number, kind: BlockKind, source: EventSource = "lesson") {
  await ensureEventsTable();
  await db().execute({
    sql: "INSERT INTO unit_events (task_id, kind, created_at, source) VALUES (?, ?, ?, ?)",
    args: [taskId, kind, now(), source],
  });
}

// ---- the teacher's own word: "this was already done" ----
// Lessons taught before the site had lesson plans are not recorded anywhere;
// she ticks them in the journey. On = one manual event (unless the unit is
// already done for that kind). Off = every recorded event of that kind goes
// (she is the authority) — what the data itself says (a closed debate, 60 %
// of the class finished) cannot be un-said and stays.
export async function setUnitDone(taskId: number, kind: BlockKind, on: boolean) {
  await ensureEventsTable();
  if (on) {
    const have = await db().execute({
      sql: "SELECT 1 FROM unit_events WHERE task_id = ? AND kind = ? LIMIT 1",
      args: [taskId, kind],
    });
    if (have.rows.length === 0) await recordUnitEvent(taskId, kind, "manual");
  } else {
    await db().execute({ sql: "DELETE FROM unit_events WHERE task_id = ? AND kind = ?", args: [taskId, kind] });
  }
}

// "Everything up to here was taught": every published unit up to and
// including this one gets all three kinds marked (only where missing).
export async function markDoneUpTo(taskId: number) {
  const units = await unitsOverview();
  const kinds: BlockKind[] = ["review", "discussion", "study"];
  for (const u of units) {
    if (u.taskId == null) continue;
    for (const kind of kinds) {
      const done = kind === "review" ? u.reviewed > 0 : kind === "discussion" ? u.discussed > 0 : u.studied > 0;
      if (!done) await recordUnitEvent(u.taskId, kind, "manual");
    }
    if (u.taskId === taskId) break;
  }
}

async function markPassed(blocks: PlanBlock[], from: number, to: number) {
  // blocks[from..to) were run — from = first not yet marked
  for (let i = Math.max(0, from); i < Math.min(to, blocks.length); i++) {
    await recordUnitEvent(blocks[i].taskId, blocks[i].kind);
  }
}

export async function setCurrent(index: number, day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  const i = Math.max(-1, Math.min(plan.blocks.length - 1, index));
  if (i > plan.current) await markPassed(plan.blocks, plan.current, i);
  await db().execute({
    sql: `UPDATE lesson_plans SET current_index = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE day = ?`,
    args: [i, i >= 0 ? now() : null, now(), day],
  });
}

// "Stop and re-plan": back to the wheels without counting anything as done.
export async function cancelPlan(day = todayIsrael()) {
  await ensurePlanTable();
  await db().execute({
    sql: "UPDATE lesson_plans SET current_index = -1, started_at = NULL, updated_at = ? WHERE day = ?",
    args: [now(), day],
  });
}

// Ending the lesson counts the current block (and any after it) as done.
export async function stopPlan(day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  if (plan.current >= 0) await markPassed(plan.blocks, plan.current, plan.blocks.length);
  await db().execute({
    sql: "UPDATE lesson_plans SET current_index = -1, started_at = NULL, updated_at = ? WHERE day = ?",
    args: [now(), day],
  });
}

// The journey: every unit in the library, in curriculum order, with what
// the teacher needs at a glance — published? how much of the class has
// completed it? was it debated? — so the lesson page is one screen.
export interface UnitOverview {
  ref: string;
  title: string;
  subtitle: string | null;
  position: string | null;
  taskId: number | null; // null = not published yet
  assigned: number;
  complete: number; // students who answered every worksheet question
  discussed: number; // closed debates on it (with speakers) or debate blocks run
  discussionOpen: boolean;
  reviewed: number; // review decks shown / review blocks run
  studied: number; // study blocks run in a lesson
  question: string | null; // the unit's discussion question (for the popover)
}

export async function unitsOverview(): Promise<UnitOverview[]> {
  const { TASK_REGISTRY } = await import("@/content/tasks/registry");
  const { eligibilityFor, discussionsOf } = await import("./discussion");
  const res = await db().execute({ sql: "SELECT id, content_ref FROM tasks", args: [] });
  const taskByRef = new Map<string, number>();
  for (const r of res.rows) taskByRef.set(String(r.content_ref), Number(r.id));
  await ensureEventsTable();
  const ev = await db().execute({
    sql: "SELECT task_id, kind, COUNT(*) AS n FROM unit_events GROUP BY task_id, kind",
    args: [],
  });
  const events = new Map<string, number>();
  for (const r of ev.rows) events.set(`${r.task_id}:${r.kind}`, Number(r.n));
  const refs = Object.keys(TASK_REGISTRY).sort((a, b) => taskOrderIndex(a) - taskOrderIndex(b));
  const out: UnitOverview[] = [];
  for (const ref of refs) {
    const c = TASK_REGISTRY[ref].content;
    const taskId = taskByRef.get(ref) ?? null;
    let assigned = 0;
    let complete = 0;
    let discussed = 0;
    let discussionOpen = false;
    let reviewed = 0;
    let studied = 0;
    if (taskId != null) {
      const elig = await eligibilityFor(taskId);
      assigned = elig.length;
      complete = elig.filter((e) => e.complete).length;
      const ds = await discussionsOf(taskId);
      discussed =
        ds.filter((d) => d.status === "closed" && d.turns > 0).length +
        (events.get(`${taskId}:discussion`) ?? 0);
      discussionOpen = ds.some((d) => d.status === "open" && (d.turns > 0 || d.notes > 0));
      reviewed = events.get(`${taskId}:review`) ?? 0;
      studied = events.get(`${taskId}:study`) ?? 0;
    }
    const { effectiveContent } = await import("./content-overrides");
    const eff = await effectiveContent(c);
    out.push({
      ref,
      title: eff.title,
      subtitle: eff.subtitle ?? null,
      position: positionLabel(ref),
      taskId,
      assigned,
      complete,
      discussed,
      discussionOpen,
      reviewed,
      studied,
      question: eff.discussion?.question ?? null,
    });
  }
  return out;
}
