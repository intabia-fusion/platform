-- Indexes of the notification rework, built after the columns, the backfill and the duplicate
-- removal of 0001-0005. Idempotent.

-- One context per (user, object); 0001 removed the duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS notification_dnc_unique_workspaceId_user_objectId_objectClass__index
    ON notification_dnc ("workspaceId", "user", "objectId", "objectClass");

-- Contexts of a document (fan-out on document update / remove)
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectId__index
    ON notification_dnc ("workspaceId", "objectId");

-- Contexts of a parent document (threads)
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_parentObjectId__index
    ON notification_dnc ("workspaceId", "parentObjectId");

-- Inbox list: user's contexts sorted by last notification time
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_lastNotify_desc__index
    ON notification_dnc ("workspaceId", "user", "lastNotify" DESC);

-- Unread badge: partial index over contexts that still have unread items
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unread__index
    ON notification_dnc ("workspaceId", "user", "unreadCount")
    WHERE "unreadCount" > 0;

-- Inbox class tabs
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_objectClass__index
    ON notification_dnc ("workspaceId", "user", "objectClass");

-- Chat badges: contexts of a user that still have unread messages
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unreadMessages__index
    ON notification_dnc ("workspaceId", "user", "unreadMessagesCount")
    WHERE "unreadMessagesCount" > 0;

-- Chat application marker: contexts of a user with unread messages that produced a notification
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_notifiedMessages__index
    ON notification_dnc ("workspaceId", "user", "notifiedMessagesCount")
    WHERE "notifiedMessagesCount" > 0;

-- notification_read_state: latest message per document
CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageId__index
    ON notification_read_state ("workspaceId", "latestMessageId");

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageTimestamp__index
    ON notification_read_state ("workspaceId", "latestMessageTimestamp");

-- Activity messages of a document, newest first
CREATE INDEX IF NOT EXISTS activity_attachedTo_createdOn__index
    ON activity ("workspaceId", "attachedTo", "createdOn" DESC);

-- Threads of a workspace, newest first
CREATE INDEX IF NOT EXISTS activity_workspaceId_modifiedOn_threads__index
    ON activity ("workspaceId", "modifiedOn" DESC)
    WHERE replies > 0;
