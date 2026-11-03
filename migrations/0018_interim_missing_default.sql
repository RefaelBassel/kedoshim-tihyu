-- Interim grade (issue #20): the toggle "משימה שלא נעשתה" now defaults to
-- "נספרת כ-0". missing_chosen = 1 marks a choice the teacher saved since this
-- change; an older row (0) falls back to the new default.
-- Also applied lazily by lib/interim-grades.ts.
ALTER TABLE interim_grade_settings ADD COLUMN missing_chosen INTEGER NOT NULL DEFAULT 0;
