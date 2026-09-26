-- Indexes of the notification rework, built after the columns (0001-0005), the backfill (0006-0008)
-- and the constraints (0009). Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS notification_dnc_unique_workspaceId_user_objectId_objectClass__index
    ON notification_dnc ("workspaceId", "user", "objectId", "objectClass");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_objectId__index
    ON notification_dnc ("workspaceId", "objectId");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_parentObjectId__index
    ON notification_dnc ("workspaceId", "parentObjectId");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_lastNotify_desc__index
    ON notification_dnc ("workspaceId", "user", "lastNotify" DESC);

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unread__index
    ON notification_dnc ("workspaceId", "user", "unreadCount")
    WHERE "unreadCount" > 0;

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_objectClass__index
    ON notification_dnc ("workspaceId", "user", "objectClass");

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unreadMessages__index
    ON notification_dnc ("workspaceId", "user", "unreadMessagesCount")
    WHERE "unreadMessagesCount" > 0;

CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_notifiedMessages__index
    ON notification_dnc ("workspaceId", "user", "notifiedMessagesCount")
    WHERE "notifiedMessagesCount" > 0;

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageId__index
    ON notification_read_state ("workspaceId", "latestMessageId");

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageTimestamp__index
    ON notification_read_state ("workspaceId", "latestMessageTimestamp");

CREATE INDEX IF NOT EXISTS activity_attachedTo_createdOn__index
    ON activity ("workspaceId", "attachedTo", "createdOn" DESC);

CREATE INDEX IF NOT EXISTS activity_workspaceId_modifiedOn_threads__index
    ON activity ("workspaceId", "modifiedOn" DESC)
    WHERE replies > 0;
