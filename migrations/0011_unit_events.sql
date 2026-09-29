-- What was done to a unit in class: a review deck shown, a debate held, a
-- study block run. Feeds the journey's "already done" colours and the
-- wheels' default positions. Also created lazily by lib/lesson-plan.ts.
CREATE TABLE IF NOT EXISTS unit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
