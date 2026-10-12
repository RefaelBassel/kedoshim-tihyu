import type { InStatement } from "@libsql/client";
import { db } from "./db";

// Merging two accounts of the same student (issue #15): a student who
// signed in with two Google addresses has work in both and is counted twice
// in every roster. Everything of the merged account moves to the kept one.
// When both worked on the same task, the more advanced version stays
// (submitted beats in-progress, then the higher progress %, a tie keeps the
// kept account's version); the other version goes to account_merge_archive,
// never deleted. Exam-prep items follow the same rule (solved, then more
// attempts). The merged account is marked (role 'merged', merged_into) — it
// leaves every list, and signing in with its email lands in the kept
// account (auth.ts). One batch = all or nothing.

const now = () => Math.floor(Date.now() / 1000);

let ready = false;
async function ensureTables() {
  if (ready) return;
  const info = await db().execute("PRAGMA table_info(users)");
  if (!info.rows.some((r) => String(r.name) === "merged_into")) {
    await db().execute("ALTER TABLE users ADD COLUMN merged_into INTEGER");
  }
  await db().execute(
    `CREATE TABLE IF NOT EXISTS account_merges (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       keep_user_id INTEGER NOT NULL,
       merged_user_id INTEGER NOT NULL,
       merged_email TEXT NOT NULL,
       summary_json TEXT NOT NULL,
       seed_key TEXT UNIQUE,
       merged_by INTEGER,
       created_at INTEGER NOT NULL
     )`
  );
  await db().execute(
    `CREATE TABLE IF NOT EXISTS account_merge_archive (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       merge_key TEXT NOT NULL,
       from_user_id INTEGER NOT NULL,
       table_name TEXT NOT NULL,
       row_json TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`
  );
  ready = true;
}
export { ensureTables as ensureMergeTables };

// Per-task work: every row of these belongs to one "version" of the task.
const TASK_TABLES = [
  "task_progress",
  "task_answers",
  "text_markings",
  "grades",
  "typing_stats",
  "typing_events",
  "focus_events",
] as const;

// Personal history that simply moves (nothing to collide).
const MOVE_TABLES = ["question_bank", "reflections", "assist_log", "notifications", "discussion_turns"] as const;

async function existingTables(): Promise<Set<string>> {
  const r = await db().execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(r.rows.map((x) => String(x.name)));
}

interface Account {
  id: number;
  email: string;
  fullName: string | null;
  role: string;
  mergedInto: number | null;
}

async function account(id: number): Promise<Account | null> {
  const r = await db().execute({
    sql: "SELECT id, email, full_name, role, merged_into FROM users WHERE id = ?",
    args: [id],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    fullName: (row.full_name as string | null) ?? null,
    role: String(row.role),
    mergedInto: row.merged_into != null ? Number(row.merged_into) : null,
  };
}

interface TaskVersion {
  submitted: boolean;
  pct: number;
}

async function taskVersions(tables: Set<string>, userId: number): Promise<Map<number, TaskVersion>> {
  const out = new Map<number, TaskVersion>();
  for (const t of TASK_TABLES) {
    if (!tables.has(t)) continue;
    const r = await db().execute({ sql: `SELECT DISTINCT task_id FROM ${t} WHERE user_id = ?`, args: [userId] });
    for (const row of r.rows) out.set(Number(row.task_id), { submitted: false, pct: 0 });
  }
  if (tables.has("task_progress")) {
    const r = await db().execute({
      sql: "SELECT task_id, submitted_at, progress_pct FROM task_progress WHERE user_id = ?",
      args: [userId],
    });
    for (const row of r.rows) {
      out.set(Number(row.task_id), { submitted: row.submitted_at != null, pct: Number(row.progress_pct ?? 0) });
    }
  }
  return out;
}

// true when the merged account's version beats the kept one
const mergedWins = (keep: TaskVersion, merged: TaskVersion) =>
  merged.submitted !== keep.submitted ? merged.submitted : merged.pct > keep.pct;

export interface MergeConflict {
  taskId: number;
  title: string;
  winner: "keep" | "merged";
  keep: TaskVersion;
  merged: TaskVersion;
}

export interface MergePlan {
  keep: Account;
  merged: Account;
  movedTasks: { taskId: number; title: string }[];
  conflicts: MergeConflict[];
  counts: {
    answers: number;
    chats: number;
    questions: number;
    reflections: number;
    messages: number;
    tickets: number;
    prepItems: number;
    prepArchived: number;
  };
  lines: string[];
}

const pctLabel = (v: TaskVersion) => (v.submitted ? "הוגש" : `בתהליך ${v.pct}%`);

async function count(tables: Set<string>, table: string, where: string, args: (number | string)[]) {
  if (!tables.has(table)) return 0;
  const r = await db().execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args });
  return Number(r.rows[0]?.n ?? 0);
}

async function prepWinners(tables: Set<string>, keepId: number, mergedId: number) {
  const out: { prepId: number; itemId: string; mergedWins: boolean }[] = [];
  if (!tables.has("exam_prep_progress")) return out;
  const r = await db().execute({
    sql: `SELECT m.prep_id, m.item_id, m.solved AS ms, m.attempts AS ma, k.solved AS ks, k.attempts AS ka
          FROM exam_prep_progress m JOIN exam_prep_progress k
            ON k.prep_id = m.prep_id AND k.item_id = m.item_id AND k.user_id = ?
          WHERE m.user_id = ?`,
    args: [keepId, mergedId],
  });
  for (const row of r.rows) {
    const ms = Number(row.ms), ks = Number(row.ks);
    out.push({
      prepId: Number(row.prep_id),
      itemId: String(row.item_id),
      mergedWins: ms !== ks ? ms > ks : Number(row.ma) > Number(row.ka),
    });
  }
  return out;
}

// Validates the pair and describes what would move — used by the
// confirmation dialog, the teacher chat preview and the merge itself.
export async function planMerge(keepId: number, mergedId: number): Promise<MergePlan | { error: string }> {
  await ensureTables();
  if (keepId === mergedId) return { error: "צריך לבחור שני חשבונות שונים" };
  const keep = await account(keepId);
  const merged = await account(mergedId);
  if (!keep || !merged) return { error: "החשבון לא נמצא" };
  if (keep.role === "teacher" || merged.role === "teacher") return { error: "אפשר לאחד רק חשבונות של תלמידים" };
  if (keep.mergedInto != null || merged.mergedInto != null) return { error: "אחד החשבונות כבר אוחד לחשבון אחר" };

  const tables = await existingTables();
  const kv = await taskVersions(tables, keepId);
  const mv = await taskVersions(tables, mergedId);
  const titles = new Map<number, string>();
  const ids = [...new Set([...kv.keys(), ...mv.keys()])];
  if (ids.length > 0) {
    const r = await db().execute({ sql: `SELECT id, title FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`, args: ids });
    for (const row of r.rows) titles.set(Number(row.id), String(row.title));
  }
  const movedTasks: MergePlan["movedTasks"] = [];
  const conflicts: MergeConflict[] = [];
  for (const [taskId, m] of mv) {
    const title = titles.get(taskId) ?? `משימה ${taskId}`;
    const k = kv.get(taskId);
    if (!k) movedTasks.push({ taskId, title });
    else conflicts.push({ taskId, title, keep: k, merged: m, winner: mergedWins(k, m) ? "merged" : "keep" });
  }

  const prep = await prepWinners(tables, keepId, mergedId);
  const counts = {
    answers: await count(tables, "task_answers", "user_id = ?", [mergedId]),
    chats: await count(tables, "assist_log", "user_id = ?", [mergedId]),
    questions: await count(tables, "question_bank", "user_id = ?", [mergedId]),
    reflections: await count(tables, "reflections", "user_id = ?", [mergedId]),
    messages: await count(tables, "messages", "from_user_id = ? OR to_user_id = ?", [mergedId, mergedId]),
    tickets: await count(tables, "discussion_participants", "user_id = ?", [mergedId]),
    prepItems: await count(tables, "exam_prep_progress", "user_id = ?", [mergedId]),
    prepArchived: prep.length,
  };

  const name = (a: Account) => a.fullName ?? a.email;
  const lines: string[] = [
    `החשבון שנשאר: ${name(keep)} (${keep.email}) · החשבון שמתמזג: ${name(merged)} (${merged.email})`,
  ];
  if (movedTasks.length) lines.push(`עוברות במלואן ${movedTasks.length} משימות: ${movedTasks.map((t) => t.title).join(" · ")}`);
  for (const c of conflicts) {
    lines.push(
      `״${c.title}״ — עבודה בשני החשבונות: נשמרת הגרסה ${c.winner === "keep" ? "של החשבון שנשאר" : "של החשבון שמתמזג"} (${pctLabel(c.winner === "keep" ? c.keep : c.merged)}); השנייה (${pctLabel(c.winner === "keep" ? c.merged : c.keep)}) נשמרת בארכיון`
    );
  }
  const extras = [
    counts.answers && `${counts.answers} תשובות`,
    counts.chats && `${counts.chats} שיחות עזרה עם קלוד`,
    counts.questions && `${counts.questions} שאלות במאגר`,
    counts.reflections && `${counts.reflections} רפלקציות`,
    counts.messages && `${counts.messages} הודעות`,
    counts.tickets && `${counts.tickets} כרטיסי כניסה לדיון`,
    counts.prepItems && `${counts.prepItems} פריטים בדף ההכנה למבחן${counts.prepArchived ? ` (${counts.prepArchived} כפולים — הטוב נשמר, השני לארכיון)` : ""}`,
  ].filter(Boolean);
  if (extras.length) lines.push(`עוברים גם: ${extras.join(" · ")}`);
  if (!movedTasks.length && !conflicts.length && !extras.length) lines.push("בחשבון שמתמזג אין עבודה שמורה.");
  lines.push(`אחרי האיחוד ${merged.email} לא יופיע ברשימות, וכניסה איתו תוביל לחשבון ${keep.email}.`);
  return { keep, merged, movedTasks, conflicts, counts, lines };
}

async function archiveRows(
  stmts: InStatement[],
  key: string,
  table: string,
  where: string,
  args: (number | string)[],
  fromUserId: number
) {
  const r = await db().execute({ sql: `SELECT * FROM ${table} WHERE ${where}`, args });
  const t = now();
  for (const row of r.rows) {
    const obj: Record<string, unknown> = {};
    for (const col of r.columns) obj[col] = row[col];
    stmts.push({
      sql: "INSERT INTO account_merge_archive (merge_key, from_user_id, table_name, row_json, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [key, fromUserId, table, JSON.stringify(obj), t],
    });
  }
  stmts.push({ sql: `DELETE FROM ${table} WHERE ${where}`, args });
}

export async function mergeAccounts(
  keepId: number,
  mergedId: number,
  opts: { by?: number | null; seedKey?: string } = {}
): Promise<{ ok: true; plan: MergePlan } | { ok: false; error: string }> {
  const plan = await planMerge(keepId, mergedId);
  if ("error" in plan) return { ok: false, error: plan.error };
  const tables = await existingTables();
  const key = opts.seedKey ?? `merge:${mergedId}->${keepId}:${now()}`;
  const stmts: InStatement[] = [];

  // the log row first: a seed that already ran fails the whole batch (UNIQUE)
  stmts.push({
    sql: `INSERT INTO account_merges (keep_user_id, merged_user_id, merged_email, summary_json, seed_key, merged_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [keepId, mergedId, plan.merged.email, JSON.stringify(plan.lines), opts.seedKey ?? null, opts.by ?? null, now()],
  });

  // 1. tasks worked in both: the losing version goes to the archive
  for (const c of plan.conflicts) {
    const loser = c.winner === "keep" ? mergedId : keepId;
    for (const t of TASK_TABLES) {
      if (tables.has(t)) await archiveRows(stmts, key, t, "task_id = ? AND user_id = ?", [c.taskId, loser], loser);
    }
  }
  // 2. everything per-task that is left now has no twin — it moves
  for (const t of TASK_TABLES) {
    if (tables.has(t)) stmts.push({ sql: `UPDATE ${t} SET user_id = ? WHERE user_id = ?`, args: [keepId, mergedId] });
  }
  if (tables.has("task_assignments")) {
    stmts.push({
      sql: "DELETE FROM task_assignments WHERE user_id = ? AND task_id IN (SELECT task_id FROM task_assignments WHERE user_id = ?)",
      args: [mergedId, keepId],
    });
    stmts.push({ sql: "UPDATE task_assignments SET user_id = ? WHERE user_id = ?", args: [keepId, mergedId] });
  }
  // 3. exam prep: per item, the better attempt stays, the other is archived
  for (const p of await prepWinners(tables, keepId, mergedId)) {
    const loser = p.mergedWins ? keepId : mergedId;
    await archiveRows(stmts, key, "exam_prep_progress", "prep_id = ? AND item_id = ? AND user_id = ?", [p.prepId, p.itemId, loser], loser);
  }
  if (tables.has("exam_prep_progress")) {
    stmts.push({ sql: "UPDATE exam_prep_progress SET user_id = ? WHERE user_id = ?", args: [keepId, mergedId] });
  }
  // 4. debate tickets: one per discussion, keeping whatever either had earned
  if (tables.has("discussion_participants")) {
    stmts.push({
      sql: `UPDATE discussion_participants SET
              eligible = MAX(eligible, (SELECT m.eligible FROM discussion_participants m WHERE m.discussion_id = discussion_participants.discussion_id AND m.user_id = ?)),
              approved = MAX(approved, (SELECT m.approved FROM discussion_participants m WHERE m.discussion_id = discussion_participants.discussion_id AND m.user_id = ?))
            WHERE user_id = ? AND EXISTS (SELECT 1 FROM discussion_participants m WHERE m.discussion_id = discussion_participants.discussion_id AND m.user_id = ?)`,
      args: [mergedId, mergedId, keepId, mergedId],
    });
    stmts.push({
      sql: "DELETE FROM discussion_participants WHERE user_id = ? AND discussion_id IN (SELECT discussion_id FROM discussion_participants WHERE user_id = ?)",
      args: [mergedId, keepId],
    });
    stmts.push({ sql: "UPDATE discussion_participants SET user_id = ? WHERE user_id = ?", args: [keepId, mergedId] });
  }
  // 5. history that just moves
  for (const t of MOVE_TABLES) {
    if (tables.has(t)) stmts.push({ sql: `UPDATE ${t} SET user_id = ? WHERE user_id = ?`, args: [keepId, mergedId] });
  }
  if (tables.has("messages")) {
    stmts.push({ sql: "UPDATE messages SET from_user_id = ? WHERE from_user_id = ?", args: [keepId, mergedId] });
    stmts.push({ sql: "UPDATE messages SET to_user_id = ? WHERE to_user_id = ?", args: [keepId, mergedId] });
  }
  if (tables.has("group_messages")) {
    stmts.push({ sql: "UPDATE group_messages SET from_user_id = ? WHERE from_user_id = ?", args: [keepId, mergedId] });
  }
  if (tables.has("group_message_reads")) {
    stmts.push({
      sql: `UPDATE group_message_reads SET last_read_message_id = MAX(last_read_message_id,
              (SELECT m.last_read_message_id FROM group_message_reads m WHERE m.group_id = group_message_reads.group_id AND m.user_id = ?))
            WHERE user_id = ? AND EXISTS (SELECT 1 FROM group_message_reads m WHERE m.group_id = group_message_reads.group_id AND m.user_id = ?)`,
      args: [mergedId, keepId, mergedId],
    });
    stmts.push({
      sql: "DELETE FROM group_message_reads WHERE user_id = ? AND group_id IN (SELECT group_id FROM group_message_reads WHERE user_id = ?)",
      args: [mergedId, keepId],
    });
    stmts.push({ sql: "UPDATE group_message_reads SET user_id = ? WHERE user_id = ?", args: [keepId, mergedId] });
  }
  // 6. the accounts: the kept one fills any gap from the merged one; the
  // merged one is marked and leaves every list
  stmts.push({
    sql: `UPDATE users SET
            full_name = COALESCE(full_name, (SELECT full_name FROM users WHERE id = ?)),
            class = COALESCE(class, (SELECT class FROM users WHERE id = ?)),
            address_form = COALESCE(address_form, (SELECT address_form FROM users WHERE id = ?)),
            onboarded_at = COALESCE(onboarded_at, (SELECT onboarded_at FROM users WHERE id = ?)),
            approved_at = COALESCE(approved_at, (SELECT approved_at FROM users WHERE id = ?), ?)
          WHERE id = ?`,
    args: [mergedId, mergedId, mergedId, mergedId, mergedId, now(), keepId],
  });
  stmts.push({
    sql: "UPDATE users SET role = 'merged', merged_into = ? WHERE id = ?",
    args: [keepId, mergedId],
  });

  try {
    await db().batch(stmts, "write");
  } catch (err) {
    console.error("[account-merge] batch failed:", err);
    return { ok: false, error: "האיחוד נכשל — לא שונה דבר" };
  }
  return { ok: true, plan };
}

// The two duplicate students the teacher named in issue #15. Each runs
// once (seed_key), and only when both ids still carry the expected emails.
const SEED_MERGES = [
  { key: "issue-15-zohar", keep: 27, keepEmail: "zoharginati@gmail.com", merged: 16, mergedEmail: "zohar.gnt@gmail.com" },
  { key: "issue-15-noam", keep: 23, keepEmail: "noamrachamim2026@gmail.com", merged: 10, mergedEmail: "noamrachamim2012@gmail.com" },
];

let seedsDone = false;
export async function runSeedMerges() {
  if (seedsDone) return;
  await ensureTables();
  const done = await db().execute("SELECT seed_key FROM account_merges WHERE seed_key IS NOT NULL");
  const ran = new Set(done.rows.map((r) => String(r.seed_key)));
  for (const s of SEED_MERGES) {
    if (ran.has(s.key)) continue;
    const keep = await account(s.keep);
    const merged = await account(s.merged);
    if (keep?.email.toLowerCase() !== s.keepEmail || merged?.email.toLowerCase() !== s.mergedEmail) continue;
    if (merged.mergedInto != null) continue;
    const r = await mergeAccounts(s.keep, s.merged, { seedKey: s.key });
    if (!r.ok) console.error(`[account-merge] seed ${s.key}:`, r.error);
  }
  seedsDone = true;
}

// Signing in with a merged account's email lands in the account it was
// merged into (followed a few hops, in case of a chain).
export async function resolveMergedEmail(email: string): Promise<string> {
  await ensureTables();
  let e = email.toLowerCase();
  for (let i = 0; i < 5; i++) {
    const r = await db().execute({
      sql: "SELECT t.email FROM users u JOIN users t ON t.id = u.merged_into WHERE u.email = ?",
      args: [e],
    });
    const next = r.rows[0]?.email;
    if (next == null) break;
    e = String(next).toLowerCase();
  }
  return e;
}
