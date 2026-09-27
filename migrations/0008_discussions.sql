-- The classroom debate: one discussion per lesson opening, its participants
-- (eligibility from the completed worksheet + the teacher's approval), the
-- timed speaking turns and the "wall" of key sentences the teacher types.
-- Also created lazily by lib/discussion.ts; this file is the canonical DDL.

CREATE TABLE IF NOT EXISTS discussions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  seconds_per_speaker INTEGER NOT NULL DEFAULT 60,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS discussion_participants (
  discussion_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  eligible INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (discussion_id, user_id)
);

CREATE TABLE IF NOT EXISTS discussion_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discussion_id INTEGER NOT NULL,
  user_id INTEGER,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS discussion_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discussion_id INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  tag TEXT,
  created_at INTEGER NOT NULL
);
