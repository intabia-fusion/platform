-- Backfill of `activity."lastReply"` (0011) from `data`, and from the newest reply for threads older
-- than the trigger that sets it. `activity` is the largest table: on a big workspace region run this
-- file in batches by `_id` range before the migrator, the statements themselves are idempotent.

UPDATE activity
SET "lastReply" = CASE WHEN jsonb_typeof(data->'lastReply') = 'number' THEN (data->>'lastReply')::numeric::bigint END,
    data = data - 'lastReply'
WHERE data ? 'lastReply';

UPDATE activity p
SET "lastReply" = (
    SELECT max(r."createdOn")
    FROM activity r
    WHERE r."workspaceId" = p."workspaceId" AND r."attachedTo" = p._id
)
WHERE p.replies > 0 AND p."lastReply" IS NULL;
