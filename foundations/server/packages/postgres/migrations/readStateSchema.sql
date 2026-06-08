-- Migration to add latestMessageId and latestMessageTimestamp to notification_read_state
ALTER TABLE notification_read_state
ADD COLUMN IF NOT EXISTS "latestMessageId" text,
ADD COLUMN IF NOT EXISTS "latestMessageTimestamp" bigint;

-- Indexes for the new columns including workspaceId
CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageId__index 
ON notification_read_state ("workspaceId", "latestMessageId");

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageTimestamp__index 
ON notification_read_state ("workspaceId", "latestMessageTimestamp");
