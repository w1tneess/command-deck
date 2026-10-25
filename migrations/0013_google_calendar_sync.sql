-- Migration 0013: Google Cloud Calendar API v3 Two-Way Live Sync
CREATE TABLE IF NOT EXISTS google_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Single-user singleton
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  last_synced_at TEXT,
  sync_token TEXT
);

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY, -- Google Event ID
  summary TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL, -- ISO with IST offset (+05:30)
  ends_at TEXT NOT NULL,
  is_study_block INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_external_events_times ON external_events(starts_at, ends_at);
