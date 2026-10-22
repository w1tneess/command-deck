CREATE TABLE subjects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, grp TEXT NOT NULL,
  priority INTEGER NOT NULL, exam_date TEXT
);
CREATE TABLE chapters (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id),
  name TEXT NOT NULL, pos INTEGER NOT NULL,
  introduced_in TEXT NOT NULL DEFAULT 'earlier',
  confirmed INTEGER NOT NULL DEFAULT 0, source TEXT
);
CREATE TABLE progress (
  chapter_id TEXT PRIMARY KEY REFERENCES chapters(id),
  status TEXT NOT NULL DEFAULT 'not_started',
  confidence INTEGER NOT NULL DEFAULT 1,
  last_revised TEXT, practice_done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
  subject_id TEXT, kind TEXT NOT NULL DEFAULT 'task',
  due TEXT, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT NOT NULL,
  day TEXT NOT NULL, minutes INTEGER NOT NULL
);
CREATE INDEX sessions_day ON sessions(day);
CREATE INDEX chapters_subject ON chapters(subject_id, pos);
