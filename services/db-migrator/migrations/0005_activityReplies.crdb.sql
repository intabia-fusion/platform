-- `replies` of an activity message as a column (backfilled in 0008, indexed in 0010).

ALTER TABLE activity
    ADD COLUMN IF NOT EXISTS replies integer;
