-- One question per screen on the student's task page (issue #21): the screen
-- the student was on (the question's key, or 'summary'), so returning to the
-- task lands where they stopped. Also applied lazily by lib/tasks.ts.
CREATE TABLE IF NOT EXISTS task_steps (
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
