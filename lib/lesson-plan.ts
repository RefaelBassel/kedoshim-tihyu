import { db } from "./db";
import { taskOrderIndex, positionLabel } from "@/content/tasks/registry";
import { nextIndex } from "./lesson-flow";

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
  id?: string; // stable identity of the reel — the "now" pointer follows it through edits
  done?: boolean; // run already in the lesson that is going on
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
  const running = existing.current >= 0;
  const seen = new Set<string>();
  const ranAlready = new Set(existing.blocks.filter((b) => b.done && b.id).map((b) => `${b.id}|${b.kind}|${b.taskId}`));
  const clean = blocks.slice(0, 12).map((b, i) => {
    let id = b.id && b.id.length <= 60 ? b.id : `b${i}-${now()}`;
    while (seen.has(id)) id += `-${i}`;
    seen.add(id);
    const out: PlanBlock = { kind: b.kind, taskId: b.taskId, title: b.title, id };
    if (running && ranAlready.has(`${id}|${b.kind}|${b.taskId}`)) out.done = true;
    return out;
  });
  // The plan may be edited while the lesson runs — reorder, add, remove,
  // change a reel's kind or unit. "Now" stays on the same reel wherever it
  // moved; if she removed it, on whatever took its place.
  let current = -1;
  let startedAt = existing.startedAt;
  if (running && clean.length > 0) {
    const curId = existing.blocks[existing.current]?.id;
    const at = curId ? clean.findIndex((b) => b.id === curId) : -1;
    current = at >= 0 ? at : Math.min(existing.current, clean.length - 1);
  } else {
    startedAt = null;
  }
  await db().execute({
    sql: `INSERT INTO lesson_plans (day, blocks_json, current_index, started_at, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(day) DO UPDATE SET blocks_json = excluded.blocks_json,
            current_index = excluded.current_index, started_at = excluded.started_at,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [day, JSON.stringify(clean), current, startedAt, teacherId, now()],
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
       source TEXT NOT NULL DEFAULT 'lesson' -- 'lesson' | 'manual' | 'off'
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
  // it happened (again) — her earlier "not done" mark no longer holds
  await db().execute({ sql: "DELETE FROM unit_events WHERE task_id = ? AND kind = ? AND source = 'off'", args: [taskId, kind] });
  await db().execute({
    sql: "INSERT INTO unit_events (task_id, kind, created_at, source) VALUES (?, ?, ?, ?)",
    args: [taskId, kind, now(), source],
  });
}

// ---- the teacher's own word: "this was done" / "this was not" ----
// She is the authority, in both directions. On = one manual event (unless
// the unit already counts as done for that kind). Off = every recorded
// event of that kind goes, and an explicit 'off' mark stays — so the unit
// reads "not done" even when the site's own data says otherwise (a closed
// debate, most of the class finished). Ticking it again, or running it in
// a lesson, removes the mark.
export async function setUnitDone(taskId: number, kind: BlockKind, on: boolean) {
  await ensureEventsTable();
  if (on) {
    await db().execute({ sql: "DELETE FROM unit_events WHERE task_id = ? AND kind = ? AND source = 'off'", args: [taskId, kind] });
    const have = await db().execute({
      sql: "SELECT 1 FROM unit_events WHERE task_id = ? AND kind = ? LIMIT 1",
      args: [taskId, kind],
    });
    if (have.rows.length === 0) await recordUnitEvent(taskId, kind, "manual");
  } else {
    await db().execute({ sql: "DELETE FROM unit_events WHERE task_id = ? AND kind = ?", args: [taskId, kind] });
    await db().execute({
      sql: "INSERT INTO unit_events (task_id, kind, created_at, source) VALUES (?, ?, ?, 'off')",
      args: [taskId, kind, now()],
    });
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
      const done =
        !u.off.includes(kind) &&
        (kind === "review" ? u.reviewed > 0 : kind === "discussion" ? u.discussed > 0 : u.studied > 0);
      if (!done) await recordUnitEvent(u.taskId, kind, "manual");
    }
    if (u.taskId === taskId) break;
  }
}

async function writePlan(day: string, blocks: PlanBlock[], current: number, startedAt: number | null) {
  await db().execute({
    sql: "UPDATE lesson_plans SET blocks_json = ?, current_index = ?, started_at = ?, updated_at = ? WHERE day = ?",
    args: [JSON.stringify(blocks), current, startedAt, now(), day],
  });
}
const withoutDone = (blocks: PlanBlock[]): PlanBlock[] =>
  blocks.map((b) => ({ kind: b.kind, taskId: b.taskId, title: b.title, ...(b.id ? { id: b.id } : {}) }));

// Moving through the lesson. The order is the teacher's: "next" goes to the
// next block still waiting, "goto" jumps to any block (ahead or back, done
// or not), "prev" steps back. Leaving a block forward or by a jump counts it
// as run (once per lesson) — the journey's colours come from that.
export type PlanMove = "start" | "next" | "prev" | "goto";
export async function movePlan(move: PlanMove, index?: number, day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  if (plan.blocks.length === 0) return;
  let blocks = plan.blocks.map((b) => ({ ...b }));
  const leave = async () => {
    const cur = plan.current >= 0 ? blocks[plan.current] : null;
    if (!cur) return;
    if (!cur.done) await recordUnitEvent(cur.taskId, cur.kind);
    cur.done = true;
  };
  let target = plan.current;
  if (move === "start" || plan.current < 0) {
    blocks = withoutDone(blocks);
    target = move === "goto" && Number.isInteger(index) ? Math.max(0, Math.min(blocks.length - 1, index as number)) : 0;
  } else if (move === "next") {
    await leave();
    target = nextIndex({ blocks, current: plan.current });
    if (target < 0) {
      // nothing is waiting — the lesson is over
      await writePlan(day, withoutDone(blocks), -1, null);
      return;
    }
  } else if (move === "prev") {
    target = Math.max(0, plan.current - 1);
  } else {
    target = Number.isInteger(index) ? Math.max(0, Math.min(blocks.length - 1, index as number)) : plan.current;
    if (target === plan.current) return;
    await leave();
  }
  await writePlan(day, blocks, target, plan.startedAt ?? now());
}

// "Stop and re-plan": back to the wheels without counting anything more as done.
export async function cancelPlan(day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  await writePlan(day, withoutDone(plan.blocks), -1, null);
}

// Ending the lesson counts the block she is on as run. Blocks she never
// reached stay as they are — skipping is hers to decide.
export async function stopPlan(day = todayIsrael()) {
  await ensurePlanTable();
  const plan = await getPlan(day);
  const cur = plan.current >= 0 ? plan.blocks[plan.current] : null;
  if (cur && !cur.done) await recordUnitEvent(cur.taskId, cur.kind);
  await writePlan(day, withoutDone(plan.blocks), -1, null);
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
  off: BlockKind[]; // kinds the teacher explicitly marked "not done" — her word wins
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
    sql: "SELECT task_id, kind, COUNT(*) AS n FROM unit_events WHERE source != 'off' GROUP BY task_id, kind",
    args: [],
  });
  const events = new Map<string, number>();
  for (const r of ev.rows) events.set(`${r.task_id}:${r.kind}`, Number(r.n));
  const offRows = await db().execute({ sql: "SELECT DISTINCT task_id, kind FROM unit_events WHERE source = 'off'", args: [] });
  const offs = new Map<number, BlockKind[]>();
  for (const r of offRows.rows) offs.set(Number(r.task_id), [...(offs.get(Number(r.task_id)) ?? []), String(r.kind) as BlockKind]);
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
      off: taskId != null ? offs.get(taskId) ?? [] : [],
      question: eff.discussion?.question ?? null,
    });
  }
  return out;
}
