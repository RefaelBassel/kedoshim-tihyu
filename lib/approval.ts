import { db } from "./db";
import { createNotification, teacherIds } from "./notify";

// Account approval. A Google sign-in no longer grants access by itself:
// every non-teacher account starts PENDING and sees only /pending until a
// teacher approves it (bell notification, never email). Teachers on the
// lib/roles.ts whitelist are always approved. A blocked account is kept
// (with its work) but cannot get past the gate.

// Names a teacher identified for accounts whose Google profile gave none
// (issue #19). Applied only if the id still carries the expected email.
const SEED_NAMES: { id: number; email: string; name: string }[] = [
  { id: 28, email: "oragus2012@gmail.com", name: "אור איגוס" },
];

let columnsReady = false;
export async function ensureApprovalColumns() {
  if (columnsReady) return;
  const info = await db().execute("PRAGMA table_info(users)");
  const cols = new Set(info.rows.map((r) => String(r.name)));
  if (!cols.has("approved_at")) {
    await db().execute("ALTER TABLE users ADD COLUMN approved_at INTEGER");
    // one-time grandfathering (Rafael, 2026-09-27, option ב): every account
    // that existed before the gate stays in; the gate applies to newcomers,
    // and strangers already inside are removed by hand from the roster
    await db().execute("UPDATE users SET approved_at = created_at WHERE approved_at IS NULL");
  }
  if (!cols.has("blocked_at")) {
    await db().execute("ALTER TABLE users ADD COLUMN blocked_at INTEGER");
  }
  // teacher-set display names (issue #19)
  if (!cols.has("name_set_by_teacher_at")) {
    await db().execute("ALTER TABLE users ADD COLUMN name_set_by_teacher_at INTEGER");
  }
  // a blank name is no name: lists fall back to the email, never an empty row
  await db().execute(
    "UPDATE users SET full_name = NULL WHERE full_name IS NOT NULL AND TRIM(full_name) = ''"
  );
  // one-time names the teacher asked for; each runs only while no teacher
  // name was set on that account, so a later rename is never overwritten
  for (const s of SEED_NAMES) {
    await db().execute({
      sql: `UPDATE users SET full_name = ?, name_set_by_teacher_at = ?
            WHERE id = ? AND LOWER(email) = ? AND name_set_by_teacher_at IS NULL`,
      args: [s.name, Math.floor(Date.now() / 1000), s.id, s.email],
    });
  }
  // teachers are always in
  await db().execute(
    "UPDATE users SET approved_at = COALESCE(approved_at, created_at) WHERE role = 'teacher'"
  );
  // merged accounts (lib/account-merge.ts): the merged_into column, then the
  // one-time merges the teacher asked for (each runs once)
  const { ensureMergeTables, runSeedMerges } = await import("./account-merge");
  await ensureMergeTables();
  columnsReady = true;
  try {
    await runSeedMerges();
  } catch (err) {
    console.error("[approval] seed merges failed:", err);
  }
}

export type AccountState = "approved" | "pending" | "blocked";

// "merged": the account was merged into another one — auth.ts switches the
// session to the kept account.
export async function accountStateFor(email: string): Promise<AccountState | "merged" | null> {
  await ensureApprovalColumns();
  const res = await db().execute({
    sql: "SELECT role, approved_at, blocked_at, merged_into FROM users WHERE email = ?",
    args: [email.toLowerCase()],
  });
  const r = res.rows[0];
  if (!r) return null;
  if (r.merged_into != null) return "merged";
  if (r.blocked_at != null) return "blocked";
  if (r.role === "teacher" || r.approved_at != null) return "approved";
  return "pending";
}

const now = () => Math.floor(Date.now() / 1000);

export async function approveUser(userId: number) {
  await ensureApprovalColumns();
  await db().execute({
    sql: "UPDATE users SET approved_at = ?, blocked_at = NULL WHERE id = ?",
    args: [now(), userId],
  });
  await createNotification({
    userId,
    kind: `approved:${userId}`,
    title: "החשבון שלך אושר — ברוכים הבאים לקדושים תהיו 🌱",
    link: "/",
  });
}

// "This is a teacher": the account becomes a teacher (approved, never a
// student anywhere again) and leaves every class list — its task
// assignments go, so it no longer counts in rosters, tickets or completion.
export async function makeTeacher(userId: number) {
  await ensureApprovalColumns();
  await db().execute({
    sql: "UPDATE users SET role = 'teacher', approved_at = COALESCE(approved_at, ?), blocked_at = NULL WHERE id = ?",
    args: [now(), userId],
  });
  await db().execute({ sql: "DELETE FROM task_assignments WHERE user_id = ?", args: [userId] });
}

// back to a student — only for an account outside the teacher whitelist
export async function makeStudent(userId: number) {
  const { TEACHER_EMAILS } = await import("./roles");
  const r = await db().execute({ sql: "SELECT email FROM users WHERE id = ?", args: [userId] });
  const email = String(r.rows[0]?.email ?? "").toLowerCase();
  if (!email || TEACHER_EMAILS.has(email)) return false;
  await db().execute({ sql: "UPDATE users SET role = 'student' WHERE id = ?", args: [userId] });
  return true;
}

export async function blockUser(userId: number) {
  await ensureApprovalColumns();
  await db().execute({
    sql: "UPDATE users SET blocked_at = ? WHERE id = ? AND role <> 'teacher'",
    args: [now(), userId],
  });
}

export async function unblockUser(userId: number) {
  await ensureApprovalColumns();
  await db().execute({
    sql: "UPDATE users SET blocked_at = NULL, approved_at = COALESCE(approved_at, ?) WHERE id = ?",
    args: [now(), userId],
  });
}

// Pre-approve an email so the student walks straight in on first sign-in.
export async function preApproveEmail(email: string) {
  await ensureApprovalColumns();
  const e = email.toLowerCase().trim();
  if (!e.includes("@")) return false;
  const t = now();
  await db().execute({
    sql: `INSERT INTO users (email, role, created_at, approved_at)
          VALUES (?, 'student', ?, ?)
          ON CONFLICT(email) DO UPDATE SET approved_at = COALESCE(users.approved_at, ?), blocked_at = NULL`,
    args: [e, t, t, t],
  });
  return true;
}

// Full removal of an account that does not belong to the class (Rafael:
// "אפשרות הסרה לכל מי שנכנסו והם לא מהכיתה"). Everything the account left
// behind goes with it; the teacher confirms first in the UI. Teachers can
// never be removed this way.
export async function removeUser(userId: number) {
  await ensureApprovalColumns();
  for (const table of [
    "task_assignments",
    "task_progress",
    "task_answers",
    "text_markings",
    "grades",
    "reflections",
    "notifications",
    "question_bank",
    "assist_log",
    "focus_events",
    "check_results",
    "writing_results",
    "debate_votes",
    "group_message_reads",
  ]) {
    try {
      await db().execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [userId] });
    } catch {
      /* table may not exist yet (created lazily) */
    }
  }
  for (const [table, col] of [
    ["messages", "from_user_id"],
    ["messages", "to_user_id"],
    ["group_messages", "from_user_id"],
  ] as const) {
    await db().execute({ sql: `DELETE FROM ${table} WHERE ${col} = ?`, args: [userId] });
  }
  await db().execute({
    sql: "DELETE FROM users WHERE id = ? AND role <> 'teacher'",
    args: [userId],
  });
}

// The teacher sets a student's display name (issue #19). It wins over the
// name the student typed at onboarding and is never overwritten by a later
// sign-in or onboarding. Returns the previous state for undo.
export async function renameUser(
  userId: number,
  name: string
): Promise<{ ok: true; before: { fullName: string | null; setAt: number | null } } | { ok: false; error: string }> {
  await ensureApprovalColumns();
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return { ok: false, error: "צריך לכתוב שם." };
  const r = await db().execute({
    sql: "SELECT full_name, name_set_by_teacher_at FROM users WHERE id = ? AND merged_into IS NULL",
    args: [userId],
  });
  const row = r.rows[0];
  if (!row) return { ok: false, error: "החשבון לא נמצא." };
  await db().execute({
    sql: "UPDATE users SET full_name = ?, name_set_by_teacher_at = ? WHERE id = ?",
    args: [clean, now(), userId],
  });
  return {
    ok: true,
    before: {
      fullName: (row.full_name as string | null) ?? null,
      setAt: row.name_set_by_teacher_at != null ? Number(row.name_set_by_teacher_at) : null,
    },
  };
}

// undo of renameUser
export async function restoreUserName(userId: number, fullName: string | null, setAt: number | null) {
  await ensureApprovalColumns();
  await db().execute({
    sql: "UPDATE users SET full_name = ?, name_set_by_teacher_at = ? WHERE id = ?",
    args: [fullName && fullName.trim() ? fullName : null, setAt, userId],
  });
}

export interface AccountRow {
  id: number;
  email: string;
  fullName: string | null;
  nameSetByTeacher: boolean;
  role: string;
  createdAt: number;
  lastSeenAt: number | null;
  onboardedAt: number | null;
  state: AccountState;
  hasWork: boolean;
}

export async function listAccounts(): Promise<AccountRow[]> {
  await ensureApprovalColumns();
  const res = await db().execute({
    sql: `SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.last_seen_at,
                 u.onboarded_at, u.approved_at, u.blocked_at, u.name_set_by_teacher_at,
                 EXISTS(SELECT 1 FROM task_answers a WHERE a.user_id = u.id) AS has_work
          FROM users u
          WHERE u.merged_into IS NULL
          ORDER BY (u.approved_at IS NULL AND u.blocked_at IS NULL) DESC, u.created_at DESC`,
    args: [],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    fullName: (r.full_name as string | null) ?? null,
    nameSetByTeacher: r.name_set_by_teacher_at != null,
    role: String(r.role),
    createdAt: Number(r.created_at),
    lastSeenAt: r.last_seen_at != null ? Number(r.last_seen_at) : null,
    onboardedAt: r.onboarded_at != null ? Number(r.onboarded_at) : null,
    state:
      r.blocked_at != null
        ? "blocked"
        : r.role === "teacher" || r.approved_at != null
          ? "approved"
          : "pending",
    hasWork: Boolean(Number(r.has_work)),
  }));
}

// Bell (never email) to every teacher when a new account is waiting.
export async function announcePendingAccount(email: string, name: string | null) {
  const teachers = await teacherIds();
  for (const t of teachers) {
    await createNotification({
      userId: t.id,
      kind: `pending:${email}`,
      title: `חשבון חדש מבקש להיכנס: ${name ?? email}`,
      body: "לאישור או להסרה — ברשימת התלמידים בדשבורד.",
      link: "/dashboard/students",
    });
  }
}
