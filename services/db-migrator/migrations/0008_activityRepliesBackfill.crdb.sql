-- Backfill of `activity.replies` (0005) from `data`. `activity` is the largest table: on a big
-- workspace region run this file in batches by `_id` range before the migrator, the statement
-- itself is idempotent and skips rows that no longer carry the key.

UPDATE activity
SET replies = CASE WHEN jsonb_typeof(data->'replies') = 'number' THEN (data->>'replies')::numeric::integer END,
    data = data - 'replies'
WHERE data ? 'replies';
