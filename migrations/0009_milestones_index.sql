-- Index on milestones(project_id) to optimize milestone queries by project
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
