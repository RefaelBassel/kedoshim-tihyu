import { db } from "./db";
import { todayIsrael } from "./lesson-plan";
import { effectiveContent } from "./content-overrides";
import { TASK_REGISTRY } from "@/content/tasks/registry";
import type { QuestionBlock } from "@/content/tasks/types";
import {
  cleanClauseInput,
  isCharterLabel,
  type Clause,
  type ClauseInput,
  type ClauseStatus,
} from "./amana-shared";

// אמנת הכיתה (issue #27) — the class charter that grows unit by unit.
// Clauses are written by the teacher only (here, /dashboard/amana and the
// teacher chat). Students see them on /amana, and their answers to the
// worksheet's charter questions (label "מהפסוק לבית הספר · אמנת הכיתה") are
// collected live from task_answers as proposals; the teacher chooses which
// proposals the class sees (and whether with the name), and every student
// may give 👍 to one proposal per unit.
export * from "./amana-shared";

const now = () => Math.floor(Date.now() / 1000);

const SEED_KEY = "first-clause";
const SEED_CLAUSE: ClauseInput = {
  text: "כשפגעתי במישהו או לקחתי משהו שלו — קודם מתקנים ומחזירים, ורק אחר כך מבקשים סליחה.",
  verseQuote: "וְהֵשִׁיב אֶת הַגְּזֵלָה אֲשֶׁר גָּזָל … וְאֶת אֲשָׁמוֹ יָבִיא לַה׳",
  verseSource: "ויקרא ה׳, כ״ג, כ״ה",
  unitRef: "nedava-3",
  status: "draft",
};

let ready = false;
async function ensureAmanaTables() {
  if (ready) return;
  const c = db();
  await c.execute(
    `CREATE TABLE IF NOT EXISTS amana_clauses (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       position INTEGER NOT NULL,
       text TEXT NOT NULL,
       verse_quote TEXT NOT NULL DEFAULT '',
       verse_source TEXT NOT NULL DEFAULT '',
       unit_ref TEXT,
       status TEXT NOT NULL DEFAULT 'draft',
       teacher_note TEXT NOT NULL DEFAULT '',
       admin_notes TEXT NOT NULL DEFAULT '',
       clause_date TEXT NOT NULL,
       proposed_by TEXT NOT NULL DEFAULT '',
       created_by INTEGER,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS amana_proposals (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       unit_ref TEXT NOT NULL,
       user_id INTEGER NOT NULL,
       question_key TEXT NOT NULL,
       shown INTEGER NOT NULL DEFAULT 0,
       show_name INTEGER NOT NULL DEFAULT 0,
       updated_at INTEGER NOT NULL,
       UNIQUE(unit_ref, user_id, question_key)
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS amana_votes (
       unit_ref TEXT NOT NULL,
       voter_id INTEGER NOT NULL,
       proposal_id INTEGER NOT NULL,
       created_at INTEGER NOT NULL,
       PRIMARY KEY (unit_ref, voter_id)
     )`
  );
  await c.execute(
    `CREATE TABLE IF NOT EXISTS amana_seen (
       user_id INTEGER PRIMARY KEY,
       last_clause_id INTEGER NOT NULL,
       seen_at INTEGER NOT NULL
     )`
  );
  await c.execute(`CREATE TABLE IF NOT EXISTS amana_seeds (seed_key TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const seeded = await c.execute({ sql: "SELECT 1 FROM amana_seeds WHERE seed_key = ?", args: [SEED_KEY] });
  if (!seeded.rows.length) {
    const ins = await c.execute({
      sql: "INSERT OR IGNORE INTO amana_seeds (seed_key, applied_at) VALUES (?, ?)",
      args: [SEED_KEY, now()],
    });
    // only the request that actually claimed the seed inserts the clause
    if (ins.rowsAffected > 0) {
      ready = true;
      await addClause(SEED_CLAUSE, null);
    }
  }
  ready = true;
}

function rowToClause(r: Record<string, unknown>): Clause {
  return {
    id: Number(r.id),
    position: Number(r.position),
    text: String(r.text ?? ""),
    verseQuote: String(r.verse_quote ?? ""),
    verseSource: String(r.verse_source ?? ""),
    unitRef: (r.unit_ref as string | null) ?? null,
    status: String(r.status) as ClauseStatus,
    teacherNote: String(r.teacher_note ?? ""),
    adminNotes: String(r.admin_notes ?? ""),
    clauseDate: String(r.clause_date ?? ""),
    proposedBy: String(r.proposed_by ?? ""),
    createdAt: Number(r.created_at),
  };
}

// ------------------------------------------------------------- clauses ----

export async function listClauses(): Promise<Clause[]> {
  await ensureAmanaTables();
  const res = await db().execute("SELECT * FROM amana_clauses ORDER BY position, id");
  return res.rows.map((r) => rowToClause(r as Record<string, unknown>));
}

export async function getClause(id: number): Promise<Clause | null> {
  await ensureAmanaTables();
  const res = await db().execute({ sql: "SELECT * FROM amana_clauses WHERE id = ?", args: [id] });
  return res.rows[0] ? rowToClause(res.rows[0] as Record<string, unknown>) : null;
}

// Renumber 1..n in the current order (after a delete or a move).
async function renumber(orderIds?: number[]) {
  const ids = orderIds ?? (await db().execute("SELECT id FROM amana_clauses ORDER BY position, id")).rows.map((r) => Number(r.id));
  await db().batch(
    ids.map((id, i) => ({ sql: "UPDATE amana_clauses SET position = ? WHERE id = ?", args: [i + 1, id] })),
    "write"
  );
}

// Adds a clause at `position` (1-based; default: at the end).
export async function addClause(raw: ClauseInput, teacherId: number | null, position?: number): Promise<Clause> {
  await ensureAmanaTables();
  const input = cleanClauseInput(raw);
  if (!input.text) throw new Error("חסר נוסח לסעיף.");
  const count = Number((await db().execute("SELECT COUNT(*) AS n FROM amana_clauses")).rows[0].n);
  const t = now();
  const res = await db().execute({
    sql: `INSERT INTO amana_clauses (position, text, verse_quote, verse_source, unit_ref, status, teacher_note, admin_notes, clause_date, proposed_by, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      count + 1,
      input.text,
      input.verseQuote ?? "",
      input.verseSource ?? "",
      input.unitRef ?? null,
      input.status ?? "draft",
      input.teacherNote ?? "",
      input.adminNotes ?? "",
      input.clauseDate ?? todayIsrael(),
      input.proposedBy ?? "",
      teacherId,
      t,
      t,
    ],
  });
  const id = Number(res.lastInsertRowid);
  if (position != null && position >= 1 && position <= count) await moveClause(id, position);
  return (await getClause(id))!;
}

export async function updateClause(id: number, raw: ClauseInput): Promise<Clause> {
  await ensureAmanaTables();
  const before = await getClause(id);
  if (!before) throw new Error("הסעיף לא נמצא.");
  const p = cleanClauseInput(raw);
  if (p.text === "") throw new Error("נוסח הסעיף לא יכול להיות ריק.");
  const next = { ...before, ...p };
  await db().execute({
    sql: `UPDATE amana_clauses SET text = ?, verse_quote = ?, verse_source = ?, unit_ref = ?, status = ?, teacher_note = ?,
            admin_notes = ?, clause_date = ?, proposed_by = ?, updated_at = ? WHERE id = ?`,
    args: [next.text, next.verseQuote, next.verseSource, next.unitRef, next.status, next.teacherNote, next.adminNotes, next.clauseDate, next.proposedBy, now(), id],
  });
  return (await getClause(id))!;
}

export async function deleteClause(id: number): Promise<Clause | null> {
  await ensureAmanaTables();
  const before = await getClause(id);
  if (!before) return null;
  await db().execute({ sql: "DELETE FROM amana_clauses WHERE id = ?", args: [id] });
  await renumber();
  return before;
}

// Puts a deleted clause back (chat undo), with its id and place.
export async function restoreClause(c: Clause): Promise<void> {
  await ensureAmanaTables();
  const t = now();
  await db().execute({
    sql: `INSERT OR REPLACE INTO amana_clauses (id, position, text, verse_quote, verse_source, unit_ref, status, teacher_note, admin_notes, clause_date, proposed_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [c.id, c.position - 0.5, c.text, c.verseQuote, c.verseSource, c.unitRef, c.status, c.teacherNote, c.adminNotes, c.clauseDate, c.proposedBy, c.createdAt, t],
  });
  await renumber();
}

// Moves a clause to a 1-based position; the others shift.
export async function moveClause(id: number, position: number): Promise<void> {
  await ensureAmanaTables();
  const ids = (await db().execute("SELECT id FROM amana_clauses ORDER BY position, id")).rows.map((r) => Number(r.id));
  const from = ids.indexOf(id);
  if (from === -1) throw new Error("הסעיף לא נמצא.");
  ids.splice(from, 1);
  const to = Math.max(0, Math.min(ids.length, Math.round(position) - 1));
  ids.splice(to, 0, id);
  await renumber(ids);
}

export async function setClauseOrder(ids: number[]): Promise<void> {
  await ensureAmanaTables();
  const current = (await db().execute("SELECT id FROM amana_clauses ORDER BY position, id")).rows.map((r) => Number(r.id));
  const wanted = ids.filter((id) => current.includes(id));
  for (const id of current) if (!wanted.includes(id)) wanted.push(id);
  await renumber(wanted);
}

// ---------------------------------------------------------------- units ----

export interface CharterUnit {
  ref: string;
  title: string;
  unit: string;
}

// The ויקרא units of the year, in study order, up to brit-2 (the end of the
// book) — the charter's horizon.
const CHARTER_LAST_REF = "brit-2";
export function charterUnits(): CharterUnit[] {
  const refs = Object.keys(TASK_REGISTRY);
  const end = refs.indexOf(CHARTER_LAST_REF);
  return refs.slice(0, end === -1 ? refs.length : end + 1).map((ref) => ({
    ref,
    title: TASK_REGISTRY[ref].content.title,
    unit: TASK_REGISTRY[ref].content.unit ?? "",
  }));
}

export function unitLabel(ref: string | null): string | null {
  if (!ref) return null;
  const c = TASK_REGISTRY[ref]?.content;
  if (!c) return ref;
  return c.unit ? (c.order ? `${c.unit} · משימה ${c.order}` : c.unit) : c.title;
}

// The units still ahead: every charter unit after the furthest unit that
// already gave a clause — one empty dashed slot each on /amana.
export function remainingUnits(clauses: { unitRef: string | null }[]): CharterUnit[] {
  const units = charterUnits();
  let furthest = -1;
  for (const c of clauses) {
    const i = units.findIndex((u) => u.ref === c.unitRef);
    if (i > furthest) furthest = i;
  }
  return units.slice(furthest + 1);
}

// ------------------------------------------------------------ proposals ----

interface CharterQuestion {
  key: string;
  label: string;
  prompt: string;
  answerKeys: { key: string; label: string }[]; // the proposal is the last one
}

async function charterQuestions(ref: string): Promise<CharterQuestion[]> {
  const reg = TASK_REGISTRY[ref];
  if (!reg) return [];
  const content = await effectiveContent(reg.content);
  const out: CharterQuestion[] = [];
  for (const sec of content.sections) {
    for (const b of sec.blocks) {
      if (b.type !== "question") continue;
      const q = b as QuestionBlock;
      if (!isCharterLabel(q.label)) continue;
      out.push({
        key: q.key,
        label: q.label,
        prompt: q.prompt,
        answerKeys: q.fields?.length ? q.fields.map((f) => ({ key: `${q.key}:${f.key}`, label: f.label })) : [{ key: q.key, label: "" }],
      });
    }
  }
  return out;
}

export interface TeacherProposal {
  proposalId: number | null;
  userId: number;
  name: string;
  klass: string | null;
  questionKey: string;
  text: string; // the clause the student proposed
  parts: { label: string; text: string }[]; // the whole answer (multi-field questions)
  shown: boolean;
  showName: boolean;
  votes: number;
  updatedAt: number;
}

export interface UnitProposals {
  ref: string;
  title: string;
  unit: string;
  questions: { key: string; label: string; prompt: string }[];
  proposals: TeacherProposal[];
}

async function studentAnswers(ref: string, keys: string[]) {
  if (!keys.length) return [];
  const { ensureApprovalColumns } = await import("./approval");
  await ensureApprovalColumns();
  const res = await db().execute({
    sql: `SELECT ta.user_id, ta.question_key, ta.answer, ta.updated_at, u.full_name, u.email, u.class
          FROM task_answers ta
          JOIN tasks t ON t.id = ta.task_id
          JOIN users u ON u.id = ta.user_id
          WHERE t.content_ref = ? AND ta.question_key IN (${keys.map(() => "?").join(",")})
            AND u.role = 'student' AND u.approved_at IS NOT NULL AND u.blocked_at IS NULL
          ORDER BY ta.updated_at`,
    args: [ref, ...keys],
  });
  // latest answer per (student, key) — a republished unit may hold two
  const map = new Map<string, { userId: number; key: string; answer: string; updatedAt: number; name: string; email: string; klass: string | null }>();
  for (const r of res.rows) {
    map.set(`${r.user_id}|${r.question_key}`, {
      userId: Number(r.user_id),
      key: String(r.question_key),
      answer: String(r.answer ?? ""),
      updatedAt: Number(r.updated_at),
      name: (r.full_name as string | null) ?? "",
      email: String(r.email),
      klass: (r.class as string | null) ?? null,
    });
  }
  return [...map.values()];
}

// Every proposal of a unit, with names — teacher only.
export async function proposalsForUnit(ref: string): Promise<UnitProposals | null> {
  await ensureAmanaTables();
  const reg = TASK_REGISTRY[ref];
  if (!reg) return null;
  const questions = await charterQuestions(ref);
  const answers = await studentAnswers(ref, questions.flatMap((q) => q.answerKeys.map((a) => a.key)));
  const flagRows = (await db().execute({ sql: "SELECT id, user_id, question_key, shown, show_name FROM amana_proposals WHERE unit_ref = ?", args: [ref] })).rows;
  const flags = new Map(flagRows.map((r) => [`${r.user_id}|${r.question_key}`, { id: Number(r.id), shown: Number(r.shown) === 1, showName: Number(r.show_name) === 1 }]));
  const voteRows = (await db().execute({ sql: "SELECT proposal_id, COUNT(*) AS n FROM amana_votes WHERE unit_ref = ? GROUP BY proposal_id", args: [ref] })).rows;
  const votes = new Map(voteRows.map((r) => [Number(r.proposal_id), Number(r.n)]));

  const proposals: TeacherProposal[] = [];
  const byStudent = new Map<number, typeof answers>();
  for (const a of answers) byStudent.set(a.userId, [...(byStudent.get(a.userId) ?? []), a]);
  for (const [userId, rows] of byStudent) {
    for (const q of questions) {
      const parts = q.answerKeys.map((k) => ({ label: k.label, text: rows.find((r) => r.key === k.key)?.answer.trim() ?? "" }));
      const filled = parts.filter((p) => p.text);
      if (!filled.length) continue;
      const last = parts[parts.length - 1].text;
      const text = last || filled.map((p) => p.text).join(" · ");
      const any = rows[0];
      const f = flags.get(`${userId}|${q.key}`);
      proposals.push({
        proposalId: f?.id ?? null,
        userId,
        name: any.name || any.email,
        klass: any.klass,
        questionKey: q.key,
        text,
        parts: q.answerKeys.length > 1 ? parts : [],
        shown: f?.shown ?? false,
        showName: f?.showName ?? false,
        votes: f ? votes.get(f.id) ?? 0 : 0,
        updatedAt: Math.max(...rows.map((r) => r.updatedAt)),
      });
    }
  }
  proposals.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "he"));
  return {
    ref,
    title: reg.content.title,
    unit: reg.content.unit ?? "",
    questions: questions.map((q) => ({ key: q.key, label: q.label, prompt: q.prompt })),
    proposals,
  };
}

// Units that have a charter question (or already gave proposals), in study
// order — the teacher's proposals board.
export async function proposalsOverview(): Promise<UnitProposals[]> {
  const out: UnitProposals[] = [];
  for (const ref of Object.keys(TASK_REGISTRY)) {
    const p = await proposalsForUnit(ref);
    if (p && (p.questions.length || p.proposals.length)) out.push(p);
  }
  return out;
}

export async function setProposalFlags(
  ref: string,
  userId: number,
  questionKey: string,
  flags: { shown?: boolean; showName?: boolean }
): Promise<{ id: number; shown: boolean; showName: boolean }> {
  await ensureAmanaTables();
  await db().execute({
    sql: `INSERT INTO amana_proposals (unit_ref, user_id, question_key, shown, show_name, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(unit_ref, user_id, question_key) DO NOTHING`,
    args: [ref, userId, questionKey, 0, 0, now()],
  });
  if (flags.shown !== undefined) {
    await db().execute({
      sql: "UPDATE amana_proposals SET shown = ?, updated_at = ? WHERE unit_ref = ? AND user_id = ? AND question_key = ?",
      args: [flags.shown ? 1 : 0, now(), ref, userId, questionKey],
    });
  }
  if (flags.showName !== undefined) {
    await db().execute({
      sql: "UPDATE amana_proposals SET show_name = ?, updated_at = ? WHERE unit_ref = ? AND user_id = ? AND question_key = ?",
      args: [flags.showName ? 1 : 0, now(), ref, userId, questionKey],
    });
  }
  const r = (await db().execute({ sql: "SELECT id, shown, show_name FROM amana_proposals WHERE unit_ref = ? AND user_id = ? AND question_key = ?", args: [ref, userId, questionKey] })).rows[0];
  return { id: Number(r.id), shown: Number(r.shown) === 1, showName: Number(r.show_name) === 1 };
}

export interface PublicProposal {
  id: number;
  text: string;
  name: string | null; // only when the teacher chose to show it
  votes: number;
  mine: boolean; // written by the viewer
}
export interface PublicUnitProposals {
  ref: string;
  title: string;
  unit: string;
  myVote: number | null;
  proposals: PublicProposal[];
}

// What the class sees under "הצעות לסעיף הבא": only proposals the teacher
// chose to show, nameless unless she chose otherwise. Newest unit first.
export async function visibleProposals(viewerId: number): Promise<PublicUnitProposals[]> {
  await ensureAmanaTables();
  const refs = (await db().execute("SELECT DISTINCT unit_ref FROM amana_proposals WHERE shown = 1")).rows.map((r) => String(r.unit_ref));
  const out: PublicUnitProposals[] = [];
  for (const ref of refs) {
    const all = await proposalsForUnit(ref);
    if (!all) continue;
    const shown = all.proposals.filter((p) => p.shown && p.proposalId != null);
    if (!shown.length) continue;
    const mv = (await db().execute({ sql: "SELECT proposal_id FROM amana_votes WHERE unit_ref = ? AND voter_id = ?", args: [ref, viewerId] })).rows[0];
    out.push({
      ref,
      title: all.title,
      unit: all.unit,
      myVote: mv ? Number(mv.proposal_id) : null,
      proposals: shown.map((p) => ({
        id: p.proposalId!,
        text: p.text,
        name: p.showName ? p.name : null,
        votes: p.votes,
        mine: p.userId === viewerId,
      })),
    });
  }
  const order = Object.keys(TASK_REGISTRY);
  out.sort((a, b) => order.indexOf(b.ref) - order.indexOf(a.ref));
  return out;
}

// 👍 — one per unit per student: voting for another proposal of the same
// unit moves the vote; voting again for the same one takes it back.
export async function toggleVote(viewerId: number, proposalId: number): Promise<{ myVote: number | null }> {
  await ensureAmanaTables();
  const p = (await db().execute({ sql: "SELECT unit_ref, shown FROM amana_proposals WHERE id = ?", args: [proposalId] })).rows[0];
  if (!p || Number(p.shown) !== 1) throw new Error("ההצעה לא נמצאה.");
  const ref = String(p.unit_ref);
  const cur = (await db().execute({ sql: "SELECT proposal_id FROM amana_votes WHERE unit_ref = ? AND voter_id = ?", args: [ref, viewerId] })).rows[0];
  if (cur && Number(cur.proposal_id) === proposalId) {
    await db().execute({ sql: "DELETE FROM amana_votes WHERE unit_ref = ? AND voter_id = ?", args: [ref, viewerId] });
    return { myVote: null };
  }
  await db().execute({
    sql: `INSERT INTO amana_votes (unit_ref, voter_id, proposal_id, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(unit_ref, voter_id) DO UPDATE SET proposal_id = excluded.proposal_id, created_at = excluded.created_at`,
    args: [ref, viewerId, proposalId, now()],
  });
  return { myVote: proposalId };
}

// --------------------------------------------------------- "חדש!" badge ----

export async function lastSeenClauseId(userId: number): Promise<number> {
  await ensureAmanaTables();
  const r = (await db().execute({ sql: "SELECT last_clause_id FROM amana_seen WHERE user_id = ?", args: [userId] })).rows[0];
  return r ? Number(r.last_clause_id) : 0;
}

export async function markClausesSeen(userId: number): Promise<void> {
  await ensureAmanaTables();
  const max = Number((await db().execute("SELECT COALESCE(MAX(id), 0) AS m FROM amana_clauses")).rows[0].m);
  await db().execute({
    sql: `INSERT INTO amana_seen (user_id, last_clause_id, seen_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET last_clause_id = MAX(amana_seen.last_clause_id, excluded.last_clause_id), seen_at = excluded.seen_at`,
    args: [userId, max, now()],
  });
}

// The newest clause (by when it was added) and the count — the /tasks and
// /me cards.
export async function charterSummary(): Promise<{ count: number; approved: number; latest: Clause | null }> {
  const clauses = await listClauses();
  const latest = clauses.reduce<Clause | null>((a, c) => (!a || c.createdAt > a.createdAt || (c.createdAt === a.createdAt && c.id > a.id) ? c : a), null);
  return { count: clauses.length, approved: clauses.filter((c) => c.status === "approved").length, latest };
}
