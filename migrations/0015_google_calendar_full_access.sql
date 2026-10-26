-- Migration 0015: full calendar access. `scope` records what Google actually granted (NULL = connected before this change, so re-consent is needed); `two_way` lets the owner turn pulling off while keeping pushes.
ALTER TABLE google_sync ADD COLUMN scope TEXT;
ALTER TABLE google_sync ADD COLUMN two_way INTEGER NOT NULL DEFAULT 1;
