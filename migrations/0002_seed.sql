-- Priority follows the student's own order: Maths > Science > Bengali > History > Civics.
INSERT INTO subjects (id, name, grp, priority) VALUES
  ('maths', 'Maths', 'Maths', 1),
  ('physics', 'Physics', 'Science', 2),
  ('chemistry', 'Chemistry', 'Science', 2),
  ('biology', 'Biology', 'Science', 2),
  ('bengali', 'Bengali', 'Languages', 3),
  ('history', 'History', 'SST', 4),
  ('civics', 'Civics', 'SST', 5),
  ('geography', 'Geography', 'SST', 6),
  ('economics', 'Economics', 'SST', 6),
  ('english', 'English', 'Languages', 6),
  ('hindi', 'Hindi', 'Languages', 6),
  ('it', 'IT', 'Other', 6);
-- Rationalised NCERT Class 10 Maths. Unconfirmed until checked against the school PDF.
INSERT INTO chapters (id, subject_id, name, pos, introduced_in, source) VALUES
  ('maths-1', 'maths', 'Real Numbers', 1, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-2', 'maths', 'Polynomials', 2, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-3', 'maths', 'Pair of Linear Equations in Two Variables', 3, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-4', 'maths', 'Quadratic Equations', 4, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-5', 'maths', 'Arithmetic Progressions', 5, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-6', 'maths', 'Triangles', 6, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-7', 'maths', 'Coordinate Geometry', 7, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-8', 'maths', 'Introduction to Trigonometry', 8, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-9', 'maths', 'Some Applications of Trigonometry', 9, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-10', 'maths', 'Circles', 10, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-11', 'maths', 'Areas Related to Circles', 11, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-12', 'maths', 'Surface Areas and Volumes', 12, 'earlier', 'Maths syllabus PDF (unverified)'),
  ('maths-13', 'maths', 'Statistics', 13, 'pb1', 'Maths syllabus PDF (unverified)'),
  ('maths-14', 'maths', 'Probability', 14, 'pb1', 'Maths syllabus PDF (unverified)');
INSERT INTO progress (chapter_id) SELECT id FROM chapters;
