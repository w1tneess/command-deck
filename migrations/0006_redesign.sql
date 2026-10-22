-- Scope split, to match the design: Unit 1 and Unit 2 replace term1. Existing term1 chapters become Unit 1,
-- and the five seeded Maths chapters the design lists under Unit 2 are re-tagged (still unchecked against the
-- school PDF). The column default stays 'term1' because SQLite can't change it; the app always sends a scope.
UPDATE chapters SET scope = 'unit1' WHERE scope = 'term1';
UPDATE chapters SET scope = 'unit2' WHERE scope = 'unit1' AND id IN ('maths-6', 'maths-7', 'maths-10', 'maths-11', 'maths-12');

-- Deliverables replace the free-form task list: school submissions, each with a status, an optional step
-- count (the Maths portfolio has 12 activities), a due date and a viva-prep flag.
CREATE TABLE deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, subject TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  phase_id TEXT REFERENCES phases(id),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  done_count INTEGER, total_count INTEGER,
  due TEXT, viva_prep INTEGER NOT NULL DEFAULT 0
);

-- The Pre-Boards 1 submissions from the school notes. Nothing is marked as started.
INSERT INTO deliverables (name, subject, detail, phase_id, done_count, total_count) VALUES
  ('Activity file (portfolio)', 'Maths', '12 activities', 'pb1', 0, 12);
INSERT INTO deliverables (name, subject, detail, phase_id) VALUES
  ('Chemistry practicals', 'Science', 'reaction types, acetic acid', 'pb1'),
  ('Physics practicals', 'Science', 'resistance, mirror, lens, refraction', 'pb1'),
  ('Our Environment project', 'Biology', 'project and leaf peel practical', 'pb1'),
  ('Student Database project', 'IT', 'project and viva', 'pb1'),
  ('Consumer Awareness or Social Issues', 'Social Science', 'project', 'pb1'),
  ('Glimpses of India portfolio', 'English', 'plus comparative analysis', 'pb1'),
  ('Language projects', 'Hindi and Bengali', 'one project each', 'pb1');

-- Carry over anything already in the old task list, then retire it.
INSERT INTO deliverables (name, subject, detail, status, due)
  SELECT title, COALESCE((SELECT name FROM subjects WHERE subjects.id = tasks.subject_id), 'General'), kind,
         CASE done WHEN 1 THEN 'done' ELSE 'not_started' END, due
  FROM tasks;
DROP TABLE tasks;
