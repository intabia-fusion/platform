-- `latestMessageTimestamp` of a read state is always set: 0 for a document without messages. A
-- sort by it (the chat navigator) then never meets NULL, which Postgres puts first in DESC order.
-- The triggers write 0 on creation; this fills the rows made before them. Idempotent.

UPDATE notification_read_state
SET "latestMessageTimestamp" = 0
WHERE "latestMessageTimestamp" IS NULL;

-- The default covers a pod that loaded the table schema before this migration and keeps inserting
-- without the column until it restarts.
ALTER TABLE notification_read_state
    ALTER COLUMN "latestMessageTimestamp" SET DEFAULT 0;

ALTER TABLE notification_read_state
    ALTER COLUMN "latestMessageTimestamp" SET NOT NULL;
