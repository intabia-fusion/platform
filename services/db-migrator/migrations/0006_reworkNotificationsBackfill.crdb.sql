-- Move the context and read state fields that became columns in 0001 out of `data`. Idempotent:
-- a row that already carries the columns and no longer has the keys is not touched.

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

UPDATE notification_read_state
SET "latestMessageId" = COALESCE("latestMessageId", data->>'latestMessageId'),
    "latestMessageTimestamp" = COALESCE("latestMessageTimestamp", (data->>'latestMessageTimestamp')::bigint),
    data = data - 'latestMessageId' - 'latestMessageTimestamp'
WHERE data ?| array['latestMessageId', 'latestMessageTimestamp'];
