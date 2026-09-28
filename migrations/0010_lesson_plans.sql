-- Today's lesson plan: the ordered blocks (review / debate / study on a
-- unit) the teacher composes, and the "now" pointer the live strip follows.
-- Also created lazily by lib/lesson-plan.ts; this file is the canonical DDL.
CREATE TABLE IF NOT EXISTS lesson_plans (
  day TEXT PRIMARY KEY,
  blocks_json TEXT NOT NULL,
  current_index INTEGER NOT NULL DEFAULT -1,
  started_at INTEGER,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);
