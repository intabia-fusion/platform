-- Backfill of the counters added in 0003 and 0004 from the `unreadMessages` array: chunks count by
-- their size and by `notifiedCount`, plain entries by 1 and by `notified`. Only rows that carry
-- unread messages need the sums, the columns arrived as 0. Idempotent.

UPDATE notification_dnc
SET "unreadMessagesCount" = COALESCE((
        SELECT sum(COALESCE((e->>'count')::integer, 1))
        FROM jsonb_array_elements(data->'unreadMessages') e
    ), 0),
    "notifiedMessagesCount" = COALESCE((
        SELECT sum(
            CASE
                WHEN e ? 'count' THEN COALESCE((e->>'notifiedCount')::integer, 0)
                WHEN e->>'notified' = 'true' THEN 1
                ELSE 0
            END
        )
        FROM jsonb_array_elements(data->'unreadMessages') e
    ), 0),
    data = data - 'notifiedMessagesCount'
WHERE jsonb_typeof(data->'unreadMessages') = 'array'
  AND jsonb_array_length(data->'unreadMessages') > 0;
