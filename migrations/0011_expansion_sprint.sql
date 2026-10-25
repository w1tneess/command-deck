-- Migration 0011: Feature Expansion Sprint (Daily targets duration/subject, session notes, chapter notes/doubts)
ALTER TABLE daily_targets ADD COLUMN duration TEXT DEFAULT '45m';
ALTER TABLE daily_targets ADD COLUMN subject_id TEXT;
ALTER TABLE sessions ADD COLUMN note TEXT;
ALTER TABLE progress ADD COLUMN notes TEXT DEFAULT '';
