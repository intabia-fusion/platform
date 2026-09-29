-- `lastReply` of an activity message as a column (backfilled in 0012, indexed in 0013).

ALTER TABLE activity
    ADD COLUMN IF NOT EXISTS "lastReply" bigint;
