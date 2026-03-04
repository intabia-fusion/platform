ALTER TABLE space
ADD "archived" bool;

UPDATE space
SET "archived" = (data->>'archived')::boolean;

ALTER TABLE space
    ADD "referenceId" text;

UPDATE space
SET "referenceId" = data->>'referenceId'
WHERE data->>'referenceId' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS space_unique_workspaceId_referenceId__index ON space ("workspaceId", "referenceId") WHERE "referenceId" IS NOT NULL;
