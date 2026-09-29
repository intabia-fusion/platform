-- Threads of a workspace by the last reply and by creation, built after the column (0011) and its
-- backfill (0012). The Threads list no longer sorts by modifiedOn. Idempotent.

CREATE INDEX IF NOT EXISTS activity_workspaceId_lastReply_threads__index
    ON activity ("workspaceId", "lastReply" DESC)
    WHERE replies > 0;

CREATE INDEX IF NOT EXISTS activity_workspaceId_createdOn_threads__index
    ON activity ("workspaceId", "createdOn" DESC)
    WHERE replies > 0;

DROP INDEX IF EXISTS activity_workspaceId_modifiedOn_threads__index;
