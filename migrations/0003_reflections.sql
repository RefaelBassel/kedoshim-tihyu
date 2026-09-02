-- Reflections: end-of-lesson (or anytime, via the side drawer) self-assessment.
-- Auto-captured context: task + Tanach chapter ref + timestamp.
-- The two skill columns keep their historical names (shared code with the
-- sister sites); here they mean:
--   pshat_progress    → הבנת הפשט (מילה מנחה, מילים קשות, שאלות)
--   argument_progress → קריאה, טעמי המקרא והתמצאות בתנ"ך
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  task_id INTEGER REFERENCES tasks(id),
  context_ref TEXT,                     -- e.g. 'ויקרא ט״ז · ״אַל יָבֹא בְכָל עֵת״' or page name
  difficulty INTEGER NOT NULL,          -- 1-10: קל מאוד → קשה מאוד
  pshat_progress INTEGER NOT NULL,      -- 1-10
  argument_progress INTEGER NOT NULL,   -- 1-10
  note TEXT,                            -- free text
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reflections_user ON reflections(user_id, created_at);
