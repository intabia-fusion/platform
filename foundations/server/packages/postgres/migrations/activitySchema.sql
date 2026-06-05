CREATE INDEX IF NOT EXISTS activity_attachedTo_createdOn__index ON activity ("workspaceId", "attachedTo", "createdOn" DESC);
