-- Exam phases. PB1 dates come from the school calendar. The others are placeholders built from
-- the month ranges only (confirmed = 0) and are meant to be edited when the datesheets are out.
-- scope says which chapters count: pb1 = Unit 1/2 + PB1, pb2 = + PB2-only, board = everything.
CREATE TABLE phases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL,
  starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0, pos INTEGER NOT NULL
);
INSERT INTO phases (id, name, scope, starts_on, ends_on, confirmed, pos) VALUES
  ('pb1', 'Pre-Boards 1', 'pb1', '2026-11-19', '2026-12-02', 1, 1),
  ('pb2', 'Pre-Boards 2', 'pb2', '2026-12-20', '2027-01-05', 0, 2),
  ('practicals', 'Practicals and Viva', 'board', '2027-01-10', '2027-02-10', 0, 3),
  ('boards', 'Board Exams', 'board', '2027-02-15', '2027-03-25', 0, 4);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Per-subject exam date for each phase (replaces subjects.exam_date).
CREATE TABLE subject_exams (
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  phase_id TEXT NOT NULL REFERENCES phases(id),
  date TEXT NOT NULL,
  PRIMARY KEY (subject_id, phase_id)
);
INSERT INTO subject_exams (subject_id, phase_id, date) SELECT id, 'pb1', exam_date FROM subjects WHERE exam_date IS NOT NULL;
ALTER TABLE subjects DROP COLUMN exam_date;

-- Chapter scope: term1 (Unit 1/2), pb1, pb2, board. Replaces introduced_in; 'earlier' becomes term1.
ALTER TABLE chapters ADD COLUMN scope TEXT NOT NULL DEFAULT 'term1';
UPDATE chapters SET scope = CASE introduced_in WHEN 'earlier' THEN 'term1' ELSE introduced_in END;
ALTER TABLE chapters DROP COLUMN introduced_in;

-- Revision passes: 1 Concept, 2 PYQs and Exemplar, 3 Sample papers.
CREATE TABLE passes (
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  pass_no INTEGER NOT NULL CHECK (pass_no BETWEEN 1 AND 3),
  done_at TEXT NOT NULL,
  PRIMARY KEY (chapter_id, pass_no)
);
