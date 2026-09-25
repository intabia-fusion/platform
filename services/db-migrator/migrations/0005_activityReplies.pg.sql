-- `replies` of an activity message as a column: a thread is a message with replies, and threads
-- are looked up newest first. In jsonb the number was compared as text and could not be indexed.
-- Idempotent. The partial index over threads is in 0010.

ALTER TABLE activity
    ADD COLUMN IF NOT EXISTS replies integer;

UPDATE activity
SET replies = CASE WHEN jsonb_typeof(data->'replies') = 'number' THEN (data->>'replies')::numeric::integer END,
    data = data - 'replies'
WHERE data ? 'replies';
