-- שקופית כללי השיעור: one projected slide (title, three blocks of lines,
-- a closing line) the teacher edits in place and reuses lesson after lesson.
-- A single row (id = 1). Also created lazily by lib/class-slide.ts.
CREATE TABLE IF NOT EXISTS class_slide (
  id INTEGER PRIMARY KEY,
  doc_json TEXT NOT NULL,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);
