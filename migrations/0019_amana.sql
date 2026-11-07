-- אמנת הכיתה (issue #27): the class charter that grows unit by unit.
-- Also created lazily by lib/amana.ts (which seeds the first clause once,
-- tracked in amana_seeds); this file is the canonical DDL.

-- The clauses, written by the teacher only. position = the clause's number.
-- status: draft | discussion | presented | approved
CREATE TABLE IF NOT EXISTS amana_clauses (
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
);

-- Student proposals are read live from task_answers (the worksheet's charter
-- questions); a row here holds only the teacher's choices for one answer:
-- shown to the class, and with or without the student's name.
CREATE TABLE IF NOT EXISTS amana_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_ref TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  shown INTEGER NOT NULL DEFAULT 0,
  show_name INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(unit_ref, user_id, question_key)
);

-- 👍: one vote per student per unit.
CREATE TABLE IF NOT EXISTS amana_votes (
  unit_ref TEXT NOT NULL,
  voter_id INTEGER NOT NULL,
  proposal_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (unit_ref, voter_id)
);

-- The newest clause each user has seen (the "חדש!" badge).
CREATE TABLE IF NOT EXISTS amana_seen (
  user_id INTEGER PRIMARY KEY,
  last_clause_id INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS amana_seeds (
  seed_key TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
