-- Merging two accounts of the same student (issue #15). The merged account
-- keeps its row (role 'merged', merged_into = the kept account) so signing
-- in with its email lands in the kept account; its work moves there. A task
-- worked in both keeps the more advanced version; the other version's rows
-- are kept in account_merge_archive, never deleted.
-- Also applied lazily by lib/account-merge.ts; this file is the canonical DDL.
ALTER TABLE users ADD COLUMN merged_into INTEGER;

CREATE TABLE IF NOT EXISTS account_merges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keep_user_id INTEGER NOT NULL,
  merged_user_id INTEGER NOT NULL,
  merged_email TEXT NOT NULL,
  summary_json TEXT NOT NULL,     -- the Hebrew summary shown before the merge
  seed_key TEXT UNIQUE,           -- one-time merges written in code run once
  merged_by INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_merge_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merge_key TEXT NOT NULL,
  from_user_id INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  row_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
