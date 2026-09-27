-- The teacher's in-place content edits (worksheet hide/reword/add, the
-- unit's discussion question, the review deck). Also created lazily by
-- lib/content-overrides.ts; this file is the canonical DDL.
CREATE TABLE IF NOT EXISTS task_content_overrides (
  content_ref TEXT NOT NULL,
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by INTEGER,
  PRIMARY KEY (content_ref, field)
);
