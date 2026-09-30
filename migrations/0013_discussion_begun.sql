-- The debate has two beats: first the teacher approves the entry tickets on
-- her own screen (the projected board shows a neutral "tickets are being
-- checked" slide), then she begins the debate and the board opens.
-- begun_at marks that moment. Also added lazily by lib/discussion.ts.
ALTER TABLE discussions ADD COLUMN begun_at INTEGER;
