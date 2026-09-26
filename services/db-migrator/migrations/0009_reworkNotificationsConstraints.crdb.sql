-- Constraints over the backfilled columns and the removal of duplicated contexts before the
-- unique index of 0010. Cockroach has ADD CONSTRAINT IF NOT EXISTS, no DO block is needed.

ALTER TABLE notification_dnc
    ALTER COLUMN "objectSpace" SET NOT NULL,
    ALTER COLUMN "lastNotify" SET NOT NULL,
    ALTER COLUMN "unreadCount" SET NOT NULL;

ALTER TABLE notification_dnc
    ADD CONSTRAINT IF NOT EXISTS notification_dnc_unreadcount_check CHECK ("unreadCount" >= 0);

ALTER TABLE notification_dnc
    ADD CONSTRAINT IF NOT EXISTS notification_dnc_unreadmessagescount_check CHECK ("unreadMessagesCount" >= 0);

ALTER TABLE notification_dnc
    ADD CONSTRAINT IF NOT EXISTS notification_dnc_notifiedmessagescount_check CHECK ("notifiedMessagesCount" >= 0);

-- One context per (user, object). Archived duplicates from the old model would make the unique
-- index fail: keep the live (non-archived) and newest row of each group, delete the rest.
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
