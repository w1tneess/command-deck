-- Edge index on chapters(subject_id, scope) and chapters(scope) for sub-millisecond query responses
CREATE INDEX IF NOT EXISTS idx_chapters_subject_scope ON chapters(subject_id, scope);
CREATE INDEX IF NOT EXISTS idx_chapters_scope ON chapters(scope);
