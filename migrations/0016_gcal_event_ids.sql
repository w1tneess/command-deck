-- Migration 0016: remember which Google event each pushed item became, so pushing again updates it instead of adding a duplicate.
-- Schedule blocks repeat daily, so a block is linked to its event for one calendar day only (gcal_event_day).
ALTER TABLE deliverables ADD COLUMN gcal_event_id TEXT;
ALTER TABLE schedule_blocks ADD COLUMN gcal_event_id TEXT;
ALTER TABLE schedule_blocks ADD COLUMN gcal_event_day TEXT;
