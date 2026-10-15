-- The default and the constraint over `latestMessageTimestamp`, backfilled in 0014. The default
-- covers a pod that loaded the table schema before 0014 and keeps inserting without the column
-- until it restarts. Idempotent.

ALTER TABLE notification_read_state
    ALTER COLUMN "latestMessageTimestamp" SET DEFAULT 0,
    ALTER COLUMN "latestMessageTimestamp" SET NOT NULL;
