-- Teacher-set display names (issue #19). A teacher may set a student's name
-- from /dashboard/students or the teacher chat (account_action rename); the
-- name she set wins over anything the student or Google gives later, so
-- onboarding never overwrites it. Blank names become NULL so every list falls
-- back to the email instead of showing an empty row.
-- Also applied lazily by lib/approval.ts; this file is the canonical DDL.
ALTER TABLE users ADD COLUMN name_set_by_teacher_at INTEGER;
UPDATE users SET full_name = NULL WHERE full_name IS NOT NULL AND TRIM(full_name) = '';
