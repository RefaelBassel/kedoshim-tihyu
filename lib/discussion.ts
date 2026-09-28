import { db } from "./db";
import { getTask } from "./tasks";
import { getTaskContent } from "@/content/tasks/registry";
import { effectiveContent, getOverrides, setOverride } from "./content-overrides";
import type { QuestionBlock } from "@/content/tasks/types";

// The classroom debate (Reut, 2026-09-27). A lesson opens with a timed
// discussion of the PREVIOUS unit's question; only students who completed
// that unit's worksheet may speak, and the teacher confirms from what the
// site shows her. Two surfaces share this state through the server: the
// projected BOARD (input-free, full screen) and the teacher's CONTROL page
// (her laptop or phone) — she never touches the projected window.

const now = () => Math.floor(Date.now() / 1000);

let ready = false;
export async function ensureDiscussionTables() {
  if (ready) return;
  const c = db();
  await c.execute(
    `CREATE TABLE IF NOT EXISTS discussions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       task_id INTEGER NOT NULL,
       question TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'closed'
       seconds_per_speaker INTEGER NOT NULL DEFAULT 60,
       created_by INTEGER,
       created_at INTEGER NOT NULL,
       closed_at INTEGER
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS discussion_participants (
       discussion_id INTEGER NOT NULL,
       user_id INTEGER NOT NULL,
       name TEXT NOT NULL,
       eligible INTEGER NOT NULL DEFAULT 0,      -- completed the worksheet
       approved INTEGER NOT NULL DEFAULT 0,      -- may speak (teacher's call)
       PRIMARY KEY (discussion_id, user_id)
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS discussion_turns (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       discussion_id INTEGER NOT NULL,
       user_id INTEGER,
       name TEXT NOT NULL,
       started_at INTEGER NOT NULL,
       ended_at INTEGER
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS discussion_notes (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       discussion_id INTEGER NOT NULL,
       speaker TEXT NOT NULL,
       text TEXT NOT NULL,
       tag TEXT,                                 -- 'claim' | 'reason' | NULL
       created_at INTEGER NOT NULL
     )`
  );
  ready = true;
}

// ---------- eligibility: who completed the worksheet ----------

export interface Eligibility {
  userId: number;
  name: string;
  klass: string | null;
  answered: number;
  total: number;
  complete: boolean;
  submitted: boolean;
}

// "Completed" = every answer field of every (effective) worksheet question is
// filled. Submission is shown but not required — Reut said: answered all
// the questions.
export async function eligibilityFor(taskId: number): Promise<Eligibility[]> {
  const task = await getTask(taskId);
  if (!task) return [];
  const baseReg = getTaskContent(task.content_ref);
  if (!baseReg) return [];
  const content = await effectiveContent(baseReg.content);
  const keys: string[] = [];
  for (const sec of content.sections) {
    for (const b of sec.blocks) {
      if (b.type !== "question") continue;
      const q = b as QuestionBlock;
      if (q.fields?.length) for (const f of q.fields) keys.push(`${q.key}:${f.key}`);
      else keys.push(q.key);
    }
  }
  const roster = await db().execute({
    sql: `SELECT u.id, u.full_name, u.email, u.class, p.submitted_at
          FROM task_assignments a JOIN users u ON u.id = a.user_id
          LEFT JOIN task_progress p ON p.task_id = a.task_id AND p.user_id = a.user_id
          WHERE a.task_id = ? AND u.role = 'student'
          ORDER BY u.full_name`,
    args: [taskId],
  });
  const answers = await db().execute({
    sql: `SELECT user_id, question_key FROM task_answers WHERE task_id = ? AND TRIM(answer) <> ''`,
    args: [taskId],
  });
  const done = new Map<number, Set<string>>();
  const keySet = new Set(keys);
  for (const r of answers.rows) {
    const k = String(r.question_key);
    if (!keySet.has(k)) continue;
    const uid = Number(r.user_id);
    if (!done.has(uid)) done.set(uid, new Set());
    done.get(uid)!.add(k);
  }
  return roster.rows.map((r) => {
    const uid = Number(r.id);
    const answered = done.get(uid)?.size ?? 0;
    return {
      userId: uid,
      name: (r.full_name as string | null) ?? String(r.email),
      klass: (r.class as string | null) ?? null,
      answered,
      total: keys.length,
      complete: keys.length > 0 && answered >= keys.length,
      submitted: r.submitted_at != null,
    };
  });
}

// ---------- discussions ----------

export interface DiscussionState {
  id: number;
  taskId: number;
  taskTitle: string;
  bookRef: string;
  question: string;
  teacherNote: string | null;
  status: "open" | "closed";
  secondsPerSpeaker: number;
  participants: {
    userId: number;
    name: string;
    klass: string | null;
    eligible: boolean;
    approved: boolean;
    answered: number;
    total: number;
    spokeSeconds: number;
    turns: number;
  }[];
  activeTurn: { id: number; userId: number | null; name: string; startedAt: number } | null;
  turns: { id: number; name: string; startedAt: number; endedAt: number | null }[];
  notes: { id: number; speaker: string; text: string; tag: string | null; createdAt: number }[];
  now: number;
}

export async function openDiscussionFor(taskId: number): Promise<number | null> {
  await ensureDiscussionTables();
  const res = await db().execute({
    sql: "SELECT id FROM discussions WHERE task_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
    args: [taskId],
  });
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

// Get the open discussion of a task or create one: question from the unit's
// (teacher-edited) content, participants from the worksheet completeness,
// approved = eligible to begin with — the teacher adjusts.
export async function getOrCreateDiscussion(taskId: number, teacherId: number): Promise<number> {
  await ensureDiscussionTables();
  const existing = await openDiscussionFor(taskId);
  if (existing) return existing;
  const task = await getTask(taskId);
  const baseReg = task ? getTaskContent(task.content_ref) : null;
  const content = baseReg ? await effectiveContent(baseReg.content) : null;
  const question = content?.discussion?.question ?? "";
  const ins = await db().execute({
    sql: `INSERT INTO discussions (task_id, question, status, seconds_per_speaker, created_by, created_at)
          VALUES (?, ?, 'open', 60, ?, ?)`,
    args: [taskId, question, teacherId, now()],
  });
  const id = Number(ins.lastInsertRowid);
  await refreshEligibility(id);
  return id;
}

// Re-read who completed the worksheet (students keep finishing during the
// lesson). New eligible students become approved; the teacher's manual
// choices on existing rows are kept.
export async function refreshEligibility(discussionId: number) {
  await ensureDiscussionTables();
  const d = await db().execute({ sql: "SELECT task_id FROM discussions WHERE id = ?", args: [discussionId] });
  if (!d.rows[0]) return;
  const taskId = Number(d.rows[0].task_id);
  const elig = await eligibilityFor(taskId);
  for (const e of elig) {
    await db().execute({
      sql: `INSERT INTO discussion_participants (discussion_id, user_id, name, eligible, approved)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(discussion_id, user_id) DO UPDATE SET
              name = excluded.name,
              eligible = excluded.eligible,
              approved = CASE
                WHEN discussion_participants.eligible = 0 AND excluded.eligible = 1 THEN 1
                ELSE discussion_participants.approved END`,
      args: [discussionId, e.userId, e.name, e.complete ? 1 : 0, e.complete ? 1 : 0],
    });
  }
}

export async function getDiscussionState(discussionId: number): Promise<DiscussionState | null> {
  await ensureDiscussionTables();
  const d = await db().execute({ sql: "SELECT * FROM discussions WHERE id = ?", args: [discussionId] });
  const row = d.rows[0];
  if (!row) return null;
  const taskId = Number(row.task_id);
  const task = await getTask(taskId);
  const baseReg = task ? getTaskContent(task.content_ref) : null;
  const content = baseReg ? await effectiveContent(baseReg.content) : null;
  const elig = await eligibilityFor(taskId);
  const eligMap = new Map(elig.map((e) => [e.userId, e]));

  const parts = await db().execute({
    sql: "SELECT user_id, name, eligible, approved FROM discussion_participants WHERE discussion_id = ? ORDER BY name",
    args: [discussionId],
  });
  const turnsRes = await db().execute({
    sql: "SELECT id, user_id, name, started_at, ended_at FROM discussion_turns WHERE discussion_id = ? ORDER BY id",
    args: [discussionId],
  });
  const notesRes = await db().execute({
    sql: "SELECT id, speaker, text, tag, created_at FROM discussion_notes WHERE discussion_id = ? ORDER BY id DESC",
    args: [discussionId],
  });
  const t = now();
  const spoke = new Map<number, { sec: number; n: number }>();
  let activeTurn: DiscussionState["activeTurn"] = null;
  const turns = turnsRes.rows.map((r) => {
    const uid = r.user_id != null ? Number(r.user_id) : null;
    const started = Number(r.started_at);
    const ended = r.ended_at != null ? Number(r.ended_at) : null;
    if (uid != null) {
      const s = spoke.get(uid) ?? { sec: 0, n: 0 };
      s.sec += (ended ?? t) - started;
      s.n += 1;
      spoke.set(uid, s);
    }
    if (ended == null) activeTurn = { id: Number(r.id), userId: uid, name: String(r.name), startedAt: started };
    return { id: Number(r.id), name: String(r.name), startedAt: started, endedAt: ended };
  });

  return {
    id: discussionId,
    taskId,
    taskTitle: content?.title ?? task?.title ?? "",
    bookRef: content?.bookRef ?? "",
    // ONE source of truth: the unit's (teacher-edited) discussion question —
    // the same text the review deck and the content hub show. The row copy
    // is only a fallback for units without a question in their content.
    question: content?.discussion?.question || String(row.question),
    teacherNote: content?.discussion?.teacherNote ?? null,
    status: row.status === "closed" ? "closed" : "open",
    secondsPerSpeaker: Number(row.seconds_per_speaker),
    participants: parts.rows.map((p) => {
      const uid = Number(p.user_id);
      const e = eligMap.get(uid);
      const s = spoke.get(uid);
      return {
        userId: uid,
        name: String(p.name),
        klass: e?.klass ?? null,
        eligible: Number(p.eligible) === 1,
        approved: Number(p.approved) === 1,
        answered: e?.answered ?? 0,
        total: e?.total ?? 0,
        spokeSeconds: s?.sec ?? 0,
        turns: s?.n ?? 0,
      };
    }),
    activeTurn,
    turns,
    notes: notesRes.rows.map((n) => ({
      id: Number(n.id),
      speaker: String(n.speaker),
      text: String(n.text),
      tag: (n.tag as string | null) ?? null,
      createdAt: Number(n.created_at),
    })),
    now: t,
  };
}

// ---------- teacher actions ----------

export async function setApproved(discussionId: number, userId: number, approved: boolean) {
  await ensureDiscussionTables();
  await db().execute({
    sql: "UPDATE discussion_participants SET approved = ? WHERE discussion_id = ? AND user_id = ?",
    args: [approved ? 1 : 0, discussionId, userId],
  });
}

// Starting a speaker's clock ends whoever is speaking now.
export async function startTurn(discussionId: number, userId: number | null, name: string) {
  await ensureDiscussionTables();
  const t = now();
  await db().execute({
    sql: "UPDATE discussion_turns SET ended_at = ? WHERE discussion_id = ? AND ended_at IS NULL",
    args: [t, discussionId],
  });
  await db().execute({
    sql: "INSERT INTO discussion_turns (discussion_id, user_id, name, started_at) VALUES (?, ?, ?, ?)",
    args: [discussionId, userId, name, t],
  });
}

export async function stopTurn(discussionId: number) {
  await ensureDiscussionTables();
  await db().execute({
    sql: "UPDATE discussion_turns SET ended_at = ? WHERE discussion_id = ? AND ended_at IS NULL",
    args: [now(), discussionId],
  });
}

export async function addNote(
  discussionId: number,
  speaker: string,
  text: string,
  tag: "claim" | "reason" | null
) {
  await ensureDiscussionTables();
  const ins = await db().execute({
    sql: "INSERT INTO discussion_notes (discussion_id, speaker, text, tag, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [discussionId, speaker.slice(0, 80), text.slice(0, 400), tag, now()],
  });
  return Number(ins.lastInsertRowid);
}

export async function deleteNote(discussionId: number, noteId: number) {
  await ensureDiscussionTables();
  await db().execute({
    sql: "DELETE FROM discussion_notes WHERE id = ? AND discussion_id = ?",
    args: [noteId, discussionId],
  });
}

export async function setSeconds(discussionId: number, seconds: number) {
  await ensureDiscussionTables();
  const s = Math.min(600, Math.max(15, Math.round(seconds)));
  await db().execute({
    sql: "UPDATE discussions SET seconds_per_speaker = ? WHERE id = ?",
    args: [s, discussionId],
  });
}

// Editing the question from the control page edits the UNIT's question (the
// content override), so the deck, the hub and the board all agree.
export async function setQuestion(discussionId: number, question: string, teacherId: number) {
  await ensureDiscussionTables();
  const q = question.slice(0, 800).trim();
  await db().execute({
    sql: "UPDATE discussions SET question = ? WHERE id = ?",
    args: [q, discussionId],
  });
  const d = await db().execute({ sql: "SELECT task_id FROM discussions WHERE id = ?", args: [discussionId] });
  const task = d.rows[0] ? await getTask(Number(d.rows[0].task_id)) : null;
  if (!task || !q) return;
  const ov = await getOverrides(task.content_ref);
  const baseReg = getTaskContent(task.content_ref);
  const note = ov.discussion?.teacherNote ?? baseReg?.content.discussion?.teacherNote;
  await setOverride(task.content_ref, "discussion", note ? { question: q, teacherNote: note } : { question: q }, teacherId);
}

export async function closeDiscussion(discussionId: number) {
  await ensureDiscussionTables();
  await stopTurn(discussionId);
  await db().execute({
    sql: "UPDATE discussions SET status = 'closed', closed_at = ? WHERE id = ?",
    args: [now(), discussionId],
  });
}

export async function reopenDiscussion(discussionId: number) {
  await ensureDiscussionTables();
  await db().execute({
    sql: "UPDATE discussions SET status = 'open', closed_at = NULL WHERE id = ?",
    args: [discussionId],
  });
}

// Past discussions of a task — the documentation Reut asked for (and a
// possible seed for the project).
export async function discussionsOf(taskId: number) {
  await ensureDiscussionTables();
  const res = await db().execute({
    sql: `SELECT d.id, d.status, d.created_at, d.closed_at,
                 (SELECT COUNT(*) FROM discussion_turns t WHERE t.discussion_id = d.id) AS turns,
                 (SELECT COUNT(*) FROM discussion_notes n WHERE n.discussion_id = d.id) AS notes
          FROM discussions d WHERE d.task_id = ? ORDER BY d.id DESC`,
    args: [taskId],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    status: String(r.status),
    createdAt: Number(r.created_at),
    closedAt: r.closed_at != null ? Number(r.closed_at) : null,
    turns: Number(r.turns),
    notes: Number(r.notes),
  }));
}
