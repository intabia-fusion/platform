ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "parentObjectId" text,
    ADD COLUMN IF NOT EXISTS "parentObjectClass" text,
    ADD COLUMN IF NOT EXISTS "objectSpace" text,
    ADD COLUMN IF NOT EXISTS "lastNotify" bigint,
    ADD COLUMN IF NOT EXISTS "unreadCount" integer;


UPDATE notification_dnc
SET "objectSpace" = COALESCE("objectSpace", data->>'objectSpace', ''),
    "lastNotify" = COALESCE("lastNotify", (data->>'lastNotify')::bigint, 0),
    "unreadCount" = GREATEST(COALESCE("unreadCount", (data->>'unreadCount')::integer, 0), 0),
    "parentObjectId" = COALESCE("parentObjectId", data->>'parentObjectId'),
    "parentObjectClass" = COALESCE("parentObjectClass", data->>'parentObjectClass'),
    data = data - 'objectSpace' - 'lastNotify' - 'unreadCount' - 'parentObjectId' - 'parentObjectClass'
WHERE "objectSpace" IS NULL
   OR "lastNotify" IS NULL
   OR "unreadCount" IS NULL
   OR data ?| array['objectSpace', 'lastNotify', 'unreadCount', 'parentObjectId', 'parentObjectClass'];

ALTER TABLE notification_dnc
    ALTER COLUMN "objectSpace" SET NOT NULL,
    ALTER COLUMN "lastNotify" SET NOT NULL,
    ALTER COLUMN "unreadCount" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notification_dnc_unreadcount_check'
          AND conrelid = 'notification_dnc'::regclass
    ) THEN
        ALTER TABLE notification_dnc
            ADD CONSTRAINT notification_dnc_unreadcount_check CHECK ("unreadCount" >= 0);
    END IF;
END $$;

-- One context per (user, object). Archived duplicates from the old model would make the unique
-- index fail: keep the live (non-archived) and newest row of each group, delete the rest.
DELETE FROM notification_dnc
WHERE _id IN (
    SELECT _id FROM (
        SELECT _id, ROW_NUMBER() OVER (
            PARTITION BY "workspaceId", "user", "objectId", "objectClass"
            ORDER BY (data->>'archived' = 'true') ASC, "modifiedOn" DESC, _id
        ) AS rn
        FROM notification_dnc
    ) ranked
    WHERE rn > 1
);

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

-- Activity messages of a document, newest first
CREATE INDEX IF NOT EXISTS activity_attachedTo_createdOn__index
    ON activity ("workspaceId", "attachedTo", "createdOn" DESC);


-- notification_read_state: latest message per document
ALTER TABLE notification_read_state
    ADD COLUMN IF NOT EXISTS "latestMessageId" text,
    ADD COLUMN IF NOT EXISTS "latestMessageTimestamp" bigint;

UPDATE notification_read_state
SET "latestMessageId" = COALESCE("latestMessageId", data->>'latestMessageId'),
    "latestMessageTimestamp" = COALESCE("latestMessageTimestamp", (data->>'latestMessageTimestamp')::bigint),
    data = data - 'latestMessageId' - 'latestMessageTimestamp'
WHERE data ?| array['latestMessageId', 'latestMessageTimestamp'];

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageId__index
    ON notification_read_state ("workspaceId", "latestMessageId");

CREATE INDEX IF NOT EXISTS notification_read_state_workspaceId_latestMessageTimestamp__index
    ON notification_read_state ("workspaceId", "latestMessageTimestamp");
