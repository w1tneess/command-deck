-- The student takes Bengali as the second language, so Hindi is removed (it never had chapters).
DELETE FROM daily_targets WHERE chapter_id IN (SELECT id FROM chapters WHERE subject_id = 'hindi');
DELETE FROM passes WHERE chapter_id IN (SELECT id FROM chapters WHERE subject_id = 'hindi');
DELETE FROM progress WHERE chapter_id IN (SELECT id FROM chapters WHERE subject_id = 'hindi');
DELETE FROM chapters WHERE subject_id = 'hindi';
DELETE FROM subject_exams WHERE subject_id = 'hindi';
DELETE FROM sessions WHERE subject_id = 'hindi';
UPDATE timer SET mode = 'idle', subject_id = NULL, started_at = NULL, duration_s = 0 WHERE subject_id = 'hindi';
DELETE FROM subjects WHERE id = 'hindi';
UPDATE deliverables SET subject = 'Bengali', detail = 'one project' WHERE name = 'Language projects' AND subject = 'Hindi and Bengali';
