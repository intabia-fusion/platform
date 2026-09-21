-- Denormalized count of unread chat messages per context: chunks count by their size. The
-- notification service keeps it in step with `unreadMessages`; clients read the number and never
-- the array. Idempotent.

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "unreadMessagesCount" integer NOT NULL DEFAULT 0;

UPDATE notification_dnc
SET "unreadMessagesCount" = COALESCE((
    SELECT sum(COALESCE((e->>'count')::integer, 1))
    FROM jsonb_array_elements(
        -- A JSON null or a scalar here would abort the whole migration.
        CASE WHEN jsonb_typeof(data->'unreadMessages') = 'array' THEN data->'unreadMessages' ELSE '[]'::jsonb END
    ) e
), 0);

-- The default stays: a pod that loaded the table schema before this migration keeps inserting
-- without the column until it restarts.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notification_dnc_unreadmessagescount_check'
          AND conrelid = 'notification_dnc'::regclass
    ) THEN
        ALTER TABLE notification_dnc
            ADD CONSTRAINT notification_dnc_unreadmessagescount_check CHECK ("unreadMessagesCount" >= 0);
    END IF;
END $$;

-- Chat badges: contexts of a user that still have unread messages
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_unreadMessages__index
    ON notification_dnc ("workspaceId", "user", "unreadMessagesCount")
    WHERE "unreadMessagesCount" > 0;
