-- Backfill of `latestMessageTimestamp` (0 for a document without messages); the default and the
-- constraint over it are 0016: Cockroach takes no schema change after a write in one file.
-- Idempotent.

UPDATE notification_read_state
SET "latestMessageTimestamp" = 0
WHERE "latestMessageTimestamp" IS NULL;
