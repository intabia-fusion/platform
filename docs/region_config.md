# Region Configuration Redesign

## Problem

Current configuration uses flat env variables with custom delimiter-based encoding:

```
TRANSACTOR_URL="ws://transactor:3334;ws://localhost:3334,ws://transactor-eu:3335;ws://localhost:3335;europe"
```

This format (`internalUrl;externalUrl;region`, comma-separated groups) is hard to read, error-prone, and does not support:
- Collaborator endpoints per region (currently a single `COLLABORATOR_URL`)
- Per-workspace endpoint overrides (e.g. a dedicated transactor for a heavy workspace)
- Adding new service types without inventing new env variables and parsing logic

## Proposed Configuration Format

A single YAML-based config passed via `REGION_CONFIG` env variable (path to file) or `REGION_CONFIG_JSON` (inline JSON).

```yaml
regions:
  '':                              # default region (empty string = no region label)
    transactors:
      - external: https://platform.example.com/_tr0
        internal: http://transactor0:3334
      - external: https://platform.example.com/_tr1
        internal: http://transactor1:3334
    collaborators:
      - external: wss://platform.example.com/_cl0
        internal: ws://collaborator0:3078
      - external: wss://platform.example.com/_cl1
        internal: ws://collaborator1:3078

  europe:
    transactors:
      - external: https://eu.platform.example.com/_tr0
        internal: http://transactor-eu0:3334
    collaborators:
      - external: wss://eu.platform.example.com/_cl0
        internal: ws://collaborator-eu0:3078

workspaces:                        # optional per-workspace overrides
  550e8400-e29b-41d4-a716-446655440000:
    transactors: # Only one value is valid
      - external: https://platform.example.com/_tr_sp0
        internal: http://transactor-sp0:3334
    collaborators: # Only one value is valid
      - external: wss://platform.example.com/_cl_sp0
        internal: ws://collaborator-sp0:3078
```

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| YAML over env-encoded strings | Readable, validated at startup, supports comments |
| `external` / `internal` instead of positional `;` | Self-documenting, no parsing ambiguity |
| `workspaces` section | Allows dedicated infrastructure for specific heavy or compliance-sensitive workspaces |
| Region key `''` (empty string) = default | Matches current behavior — workspaces without explicit region fall here |
| Arrays for transactors/collaborators | Hash-based selection across the array via `hashWorkspace` |

## TypeScript Types

```typescript
interface EndpointEntry {
  external: string
  internal: string
}

interface RegionEndpoints {
  transactors: EndpointEntry[]
  collaborators: EndpointEntry[]
}

interface RegionConfig {
  regions: Record<string, RegionEndpoints>       // key = region name, '' = default
  workspaces?: Record<WorkspaceUuid, RegionEndpoints>  // per-workspace overrides
}
```

## Selection Algorithm

For a given `(workspaceUuid, region, endpointKind)`:

```
1. If workspaces[workspaceUuid] exists → use its endpoints
2. Else if regions[region] exists → use its endpoints
3. Else fallback to regions[''] (default region)
4. From the selected endpoint array: index = abs(hashWorkspace(workspaceUuid)) % array.length
5. Return external or internal URL based on EndpointKind
```

`hashWorkspace` stays the same:
```typescript
function hashWorkspace(dbWorkspaceName: string): number {
  return [...dbWorkspaceName].reduce((hash, c) => (Math.imul(31, hash) + c.charCodeAt(0)) | 0, 0)
}
```

## Backward Compatibility

Old env variables continue to work. The loading logic:

```
1. If REGION_CONFIG or REGION_CONFIG_JSON is set → use new YAML/JSON config
2. Else fallback to parsing TRANSACTOR_URL + COLLABORATOR_URL in the old format
```

This means zero changes needed for existing deployments until they opt in.

## Implementation Plan

### Phase 1: Core config parsing & shared utilities

**Package:** `server/account/src/utils.ts` (extend existing endpoint logic)

1. Add `RegionConfig`, `RegionEndpoints`, `EndpointEntry` interfaces to `server/account/src/types.ts`
2. Add config loader: `loadRegionConfig()` — reads YAML/JSON or falls back to legacy env vars
3. Refactor `getEndpointInfo()` to use `RegionConfig` internally
4. Add `getCollaboratorEndpoint(workspace, region, kind)` — same logic as `getEndpoint` but for collaborators
5. Add `resolveEndpoints(config, workspaceUuid, region)` → returns `{ transactor: EndpointEntry, collaborator: EndpointEntry }` — single place for the full selection algorithm including workspace overrides

### Phase 2: Account service

**Package:** `server/account`, `server/account-service`

1. Load `RegionConfig` at startup (in `account-service/src/index.ts`)
2. `getEndpoint()` / `getWorkspaceEndpoint()` → delegate to `resolveEndpoints()`
3. Add `collaboratorEndpoint` to `LoginInfoWorkspace` response so clients get per-workspace collaborator URL
4. `WorkspaceLoginInfo` → add `collaboratorEndpoint: string`
5. `selectWorkspace()` → include collaborator endpoint in response

### Phase 3: Front server

**Package:** `server/front`

1. Read `REGION_CONFIG` / `REGION_CONFIG_JSON` at startup
2. Remove static `COLLABORATOR_URL` from the `data` object in `config.json`
3. Make `/config.json` accept optional `?workspace=<uuid>` query parameter
4. When `workspace` is provided → resolve collaborator URL via `resolveEndpoints()` and return it as `COLLABORATOR_URL`
5. When `workspace` is not provided → return first/default collaborator URL (backward compat for pre-login config fetch)

### Phase 4: Client-side integration

**Package:** `packages/presentation`, `plugins/text-editor-resources`, `dev/prod`

1. After login (when workspace is selected), re-fetch or update `CollaboratorUrl` metadata from the login response (`LoginInfoWorkspace.collaboratorEndpoint`)
2. `presentation/src/collaborator.ts` — no changes needed if metadata is already correct
3. `text-editor-resources/src/provider/utils.ts` — no changes needed if metadata is already correct

This is the cleanest approach: the account service returns the correct collaborator URL per workspace, and the client just uses it.

### Phase 5: Server-side services

**Packages:** `services/process`, `services/github/pod-github`, `foundations/core/packages/api-client`

1. Add shared utility to `@hcengineering/collaborator-client`:
   ```typescript
   export function selectCollaboratorUrl(urls: string, workspaceId: string): string
   ```
   Parses comma-separated URLs and selects via `hashWorkspace`. Used as a simple fallback for services that don't have access to the full `RegionConfig`.

2. For services with access to account DB / region config:
   - Use `resolveEndpoints()` directly

3. For simpler services (process, github):
   - Use `selectCollaboratorUrl(process.env.COLLABORATOR_URL, workspaceId)` as a lightweight alternative

### Phase 6: Cleanup

1. Deprecate `TRANSACTOR_URL` and `COLLABORATOR_URL` env variables (keep working, log warning)
2. Remove duplicate `hashWorkspace` from `fulltext.ts` middleware — import from shared location
3. Update docker-compose files and deployment docs with examples of the new config format

## Migration Path

| Deployment state | Action needed |
|-----------------|---------------|
| Single transactor + single collaborator | None — old env vars work as before |
| Multiple transactors (current `;,` format) | None — old format still parsed |
| Want to add multiple collaborators | Set `REGION_CONFIG` or `REGION_CONFIG_JSON` with the new YAML format |
| Want per-workspace overrides | Set `workspaces` section in YAML config |

## Decisions

1. **Config hot-reload** — Not required, load once at startup.
2. **`LoginInfoWorkspace`** — Add `collaboratorEndpoint: EndpointInfo` alongside existing `endpoint: EndpointInfo`.
3. **YAML parser** — Add `js-yaml` dependency to `server/account`.
4. **Per-workspace overrides** — Only one entry per service type is valid (no array-based hash selection for workspace overrides — a workspace override pins to a specific server).
