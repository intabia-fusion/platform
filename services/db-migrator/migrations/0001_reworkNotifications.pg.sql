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
-- index (0010) fail: keep the live (non-archived) and newest row of each group, delete the rest.
-- COALESCE: a row without the `archived` key is live, and a bare NULL would sort after `true`.
DELETE FROM notification_dnc
WHERE _id IN (
    SELECT _id FROM (
        SELECT _id, ROW_NUMBER() OVER (
            PARTITION BY "workspaceId", "user", "objectId", "objectClass"
            ORDER BY (COALESCE(data->>'archived', 'false') = 'true') ASC, "modifiedOn" DESC, _id
        ) AS rn
        FROM notification_dnc
    ) ranked
    WHERE rn > 1
);

-- notification_read_state: latest message per document
ALTER TABLE notification_read_state
    ADD COLUMN IF NOT EXISTS "latestMessageId" text,
    ADD COLUMN IF NOT EXISTS "latestMessageTimestamp" bigint;

UPDATE notification_read_state
SET "latestMessageId" = COALESCE("latestMessageId", data->>'latestMessageId'),
    "latestMessageTimestamp" = COALESCE("latestMessageTimestamp", (data->>'latestMessageTimestamp')::bigint),
    data = data - 'latestMessageId' - 'latestMessageTimestamp'
WHERE data ?| array['latestMessageId', 'latestMessageTimestamp'];

