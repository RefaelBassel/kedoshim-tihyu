-- Interim grade for a unit (issue #17, ויקרא ט״ז): Claude checks every answer
-- of every student in the unit's tasks with a lenient policy; the teacher sees
-- a proposed grade per task and an average, overrides any of them, and may
-- publish the task grades to the students (grades.score) — never by default.
-- Also applied lazily by lib/interim-grades.ts; this file is the canonical DDL.

-- Claude's check of one answer, kept so the page never re-checks on load.
-- answer_hash = the answer as it was checked; a changed answer is re-checked.
CREATE TABLE IF NOT EXISTS interim_answer_grades (
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  score INTEGER NOT NULL,          -- 0-100
  note TEXT NOT NULL,              -- one line for the teacher only
  graded_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id, question_key)
);

-- The teacher's manual grades: task_id = a task, or 0 = the student's whole grade.
CREATE TABLE IF NOT EXISTS interim_grade_overrides (
  scope TEXT NOT NULL,             -- e.g. 'vayikra-16'
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, user_id, task_id)
);

-- Which tasks enter the average and how an untouched task counts.
CREATE TABLE IF NOT EXISTS interim_grade_settings (
  scope TEXT PRIMARY KEY,
  include_json TEXT NOT NULL,      -- task ids in the average
  missing_as_zero INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- "פרסום ציונים": what grades looked like before publishing, so that
-- cancelling the publication restores them exactly.
CREATE TABLE IF NOT EXISTS interim_grade_publications (
  scope TEXT NOT NULL,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  had_row INTEGER NOT NULL,
  prev_score INTEGER,
  prev_approved_at INTEGER,
  prev_graded_by INTEGER,
  published_score INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
