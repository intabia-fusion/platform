-- `replies` of an activity message as a column: a thread is a message with replies, and threads
-- are looked up newest first. In jsonb the number was compared as text and could not be indexed.
-- Idempotent.

ALTER TABLE activity
    ADD COLUMN IF NOT EXISTS replies integer;

UPDATE activity
SET replies = CASE WHEN jsonb_typeof(data->'replies') = 'number' THEN (data->>'replies')::numeric::integer END,
    data = data - 'replies'
WHERE data ? 'replies';

-- Threads of a workspace, newest first
CREATE INDEX IF NOT EXISTS activity_workspaceId_modifiedOn_threads__index
    ON activity ("workspaceId", "modifiedOn" DESC)
    WHERE replies > 0;
