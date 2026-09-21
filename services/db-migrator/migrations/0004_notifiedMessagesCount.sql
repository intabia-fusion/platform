-- Denormalized count of unread chat messages that produced a notification (a mentions-only or
-- muted document keeps unread messages without one): chunks count by their `notifiedCount`. The
-- notification service keeps it in step with `unreadMessages`; the chat application marker reads
-- the number and never the array. Idempotent.

ALTER TABLE notification_dnc
    ADD COLUMN IF NOT EXISTS "notifiedMessagesCount" integer NOT NULL DEFAULT 0;

-- A pod that loaded the table schema before this migration writes the value into `data`; the
-- column is the only place from now on, so the key goes.
UPDATE notification_dnc
SET "notifiedMessagesCount" = COALESCE((
        SELECT sum(
            CASE
                WHEN e ? 'count' THEN COALESCE((e->>'notifiedCount')::integer, 0)
                WHEN e->>'notified' = 'true' THEN 1
                ELSE 0
            END
        )
        FROM jsonb_array_elements(
            -- A JSON null or a scalar here would abort the whole migration.
            CASE WHEN jsonb_typeof(data->'unreadMessages') = 'array' THEN data->'unreadMessages' ELSE '[]'::jsonb END
        ) e
    ), 0),
    data = data - 'notifiedMessagesCount'
WHERE "unreadMessagesCount" > 0 OR data ? 'notifiedMessagesCount';

-- The default stays: a pod that loaded the table schema before this migration keeps inserting
-- without the column until it restarts.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notification_dnc_notifiedmessagescount_check'
          AND conrelid = 'notification_dnc'::regclass
    ) THEN
        ALTER TABLE notification_dnc
            ADD CONSTRAINT notification_dnc_notifiedmessagescount_check CHECK ("notifiedMessagesCount" >= 0);
    END IF;
END $$;

-- Chat application marker: contexts of a user with unread messages that produced a notification
CREATE INDEX IF NOT EXISTS notification_dnc_workspaceId_user_notifiedMessages__index
    ON notification_dnc ("workspaceId", "user", "notifiedMessagesCount")
    WHERE "notifiedMessagesCount" > 0;
