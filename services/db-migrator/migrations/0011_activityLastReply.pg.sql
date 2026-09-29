-- `lastReply` of an activity message as a column: the Threads list sorts by the time of the last
-- reply, and in jsonb the timestamp was compared as text, with nulls first, and could not be
-- indexed. Idempotent.

ALTER TABLE activity
    ADD COLUMN IF NOT EXISTS "lastReply" bigint;

UPDATE activity
SET "lastReply" = CASE WHEN jsonb_typeof(data->'lastReply') = 'number' THEN (data->>'lastReply')::numeric::bigint END,
    data = data - 'lastReply'
WHERE data ? 'lastReply';

-- Threads older than the trigger that sets `lastReply`: take the newest reply.
UPDATE activity p
SET "lastReply" = (
    SELECT max(r."createdOn")
    FROM activity r
    WHERE r."workspaceId" = p."workspaceId" AND r."attachedTo" = p._id
)
WHERE p.replies > 0 AND p."lastReply" IS NULL;

-- Threads of a workspace by the last reply (the default of the Threads list) and by creation.
CREATE INDEX IF NOT EXISTS activity_workspaceId_lastReply_threads__index
    ON activity ("workspaceId", "lastReply" DESC)
    WHERE replies > 0;

CREATE INDEX IF NOT EXISTS activity_workspaceId_createdOn_threads__index
    ON activity ("workspaceId", "createdOn" DESC)
    WHERE replies > 0;

-- The Threads list no longer sorts by modifiedOn.
DROP INDEX IF EXISTS activity_workspaceId_modifiedOn_threads__index;
