-- Today's targets: chapter targets (chapter_id set) are suggested from the study queue, custom ones are typed.
-- Deleting a chapter must also delete its targets.
CREATE TABLE daily_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL,
  chapter_id TEXT REFERENCES chapters(id), title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX daily_targets_day ON daily_targets(day);

-- One energy check-in per day (low, ok, high).
CREATE TABLE checkins (day TEXT PRIMARY KEY, energy TEXT NOT NULL CHECK (energy IN ('low', 'ok', 'high')));

-- The single shared focus timer, so a session started on one device can be stopped on another.
CREATE TABLE timer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL, subject_id TEXT, started_at INTEGER,
  duration_s INTEGER NOT NULL, round INTEGER NOT NULL, cycle_day TEXT
);
INSERT INTO timer (id, mode, subject_id, started_at, duration_s, round, cycle_day) VALUES (1, 'idle', NULL, NULL, 0, 0, NULL);
