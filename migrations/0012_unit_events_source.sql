-- Where a unit event came from: 'lesson' = a block the teacher moved past in
-- a running lesson (or a deck she opened); 'manual' = she ticked the circle
-- herself in the journey ("this was already taught before the site had
-- lesson plans"). Kept apart so the real lesson history stays clean.
-- Also added lazily by lib/lesson-plan.ts.
ALTER TABLE unit_events ADD COLUMN source TEXT NOT NULL DEFAULT 'lesson';
