-- Migration 0012: Daily Schedule Blocks & Calendar Settings
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('morning', 'school', 'revision', 'practice', 'winddown', 'custom')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#38bdf8',
  pos INTEGER NOT NULL DEFAULT 0
);

INSERT INTO schedule_blocks (title, category, start_time, end_time, color, pos) VALUES
  ('Morning Deep Work', 'morning', '07:00', '08:30', '#38bdf8', 1),
  ('School & Lab Sessions', 'school', '08:45', '14:30', '#f59e0b', 2),
  ('Afternoon Revision & Formula Prep', 'revision', '15:30', '17:00', '#818cf8', 3),
  ('Evening Problem Solving & PYQs', 'practice', '17:30', '19:30', '#a855f7', 4),
  ('Routine Review & Wind Down', 'winddown', '21:00', '22:00', '#ec4899', 5);

INSERT INTO settings (key, value) VALUES ('calendar_token', 'study_cal_' || lower(hex(randomblob(16))))
ON CONFLICT(key) DO NOTHING;
