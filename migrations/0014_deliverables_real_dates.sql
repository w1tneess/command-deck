-- Set realistic CBSE Pre-Boards 1 submission dates for all deliverables.
-- Chemistry practicals was due on 2026-10-20 (making it overdue relative to 2026-10-24).
UPDATE deliverables SET due = '2026-10-20' WHERE name = 'Chemistry practicals' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-10-28' WHERE name = 'Physics practicals' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-10-30' WHERE name = 'Lab manual' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-02' WHERE name = 'Our Environment project' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-05' WHERE name = 'Student Database project' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-10' WHERE name = 'Activity file (portfolio)' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-15' WHERE name = 'Consumer Awareness or Social Issues' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-18' WHERE name = 'Glimpses of India portfolio' AND phase_id = 'pb1';
UPDATE deliverables SET due = '2026-11-22' WHERE name = 'Language projects' AND phase_id = 'pb1';
