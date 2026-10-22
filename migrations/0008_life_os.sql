-- Habits, quick capture, personal projects and daily routine, for the life side of the app.

-- A habit is either a tick a day or a counter with a daily goal (e.g. 8 glasses). A day counts when value >= goal.
CREATE TABLE habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tick' CHECK (kind IN ('tick', 'count')),
  goal INTEGER NOT NULL DEFAULT 1, pos INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE habit_log (
  habit_id INTEGER NOT NULL REFERENCES habits(id), day TEXT NOT NULL, value INTEGER NOT NULL,
  PRIMARY KEY (habit_id, day)
);
INSERT INTO habits (name, kind, goal, pos) VALUES ('Workout / movement', 'tick', 1, 1);
INSERT INTO habits (name, kind, goal, pos) VALUES ('Screen-time limit', 'tick', 1, 2);

-- Brain dumps, notes and to-dos from the quick-capture drawer.
CREATE TABLE captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'todo')),
  done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

-- Personal projects with a simple milestone checklist.
CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', pos INTEGER NOT NULL DEFAULT 0);
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, pos INTEGER NOT NULL DEFAULT 0
);

-- One row per day: sleep rating, morning kickoff, evening shutdown notes.
CREATE TABLE routine (
  day TEXT PRIMARY KEY, sleep INTEGER CHECK (sleep BETWEEN 1 AND 5), kickoff_at TEXT,
  wins TEXT NOT NULL DEFAULT '', tomorrow TEXT NOT NULL DEFAULT '', shutdown_at TEXT
);

-- The weekly reflection note, keyed by the Monday that starts the week.
CREATE TABLE reviews (week_start TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '');
