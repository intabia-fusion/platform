# Meeting Minutes Sanity Tests

## How to Run

### Prerequisites

1. Docker stack running (Postgres, MinIO, Elastic, etc.):
   ```bash
   cd tests
   ./prepare-pg.sh
   ```
   This creates users (user1, user2, admin), workspaces (sanity-ws, meetings-ws), restores backups.

2. Front/server running on port 8083 (via docker-compose or `rush dev`).

3. **LiveKit** (required for meeting join/leave tests):
   ```bash
   # Install: https://docs.livekit.io/home/self-hosting/local/
   cd dev
   ./run_livekit.sh
   ```
   - Mac: Docker host network not available, run LiveKit locally
   - Port 7880, webhook `http://127.0.0.1:8098/webhook`
   - API keys: `devkey`/`devkey2`

### Running Tests

```bash
cd tests/sanity

# Install browser (first time)
rushx ci

# Run all tests
rushx uitest --reporter=list --retries=0

# Run only love/meeting tests
rushx uitest tests/love/ --reporter=list --retries=0

# Run specific spec
rushx uitest tests/love/meetings.all.spec.ts --reporter=list --retries=0

# Run specific test by name (-g matches test title)
rushx uitest tests/love/meetings.all.spec.ts -g "knocker auto-joins" --reporter=list --retries=0 --workers=1

# Debug mode (headed browser)
rushx debug tests/love/meetings.all.spec.ts
```

`rushx uitest` wraps `playwright test` with the required env (`LOCAL_URL`,
`DEV_URL`) and the right config — always prefer it over a bare `npx
playwright`. Pass extra playwright flags through unchanged.

Always pass `--reporter=list --retries=0` for dev runs — the default html
reporter spawns a local server that blocks the terminal (looks like hang),
and default retries waste minutes re-running a real failure before showing
output. `--retries=0` makes failures show up immediately so you understand
what broke fast.

### Auth

- Auth setup runs automatically (saves to `.auth/storage.json`)
- Delete `.auth/` to force re-auth
- Tests use `meetings-ws` workspace (not `sanity-ws`)
- Users: `user1` (John Appleseed), `user2` (Kainin Dirak), password `1234`

## Test Structure

```
tests/sanity/tests/
  love/
    meetings.spec.ts          # Test specs
  model/love/
    office-page.ts            # Floor view, room navigation
    meeting-minutes-page.ts   # Meeting panel (name, privacy, join/leave)
    index.ts                  # Re-exports
```

## Adding New Tests

### 1. Add data-id to Component

In the Svelte component, add `data-id` attribute:
- `ModernButton`: use `dataId` prop
- Other elements: add `data-id="..."` directly
- Naming: `meeting-*` for meeting panel, `room-*` for room elements

Existing data-ids:
- `meeting-name-input` - meeting name EditBox wrapper
- `meeting-toggle-private` - Open/Close Room button
- `meeting-connect` - Join/Start Meeting button
- `meeting-leave` - Leave Room button
- `room-enter` - Enter Room button in RoomPopup
- `room-{name}` - Room cell on floor grid (dynamic)

### 2. Add Locator to Page Object

In `tests/sanity/tests/model/love/`:
```typescript
myButton = (): Locator => this.page.locator('[data-id="my-button"]')
```

### 3. Write Test

```typescript
import { test, expect } from '@playwright/test'
import { PlatformSetting, PlatformURI } from '../utils'
import { OfficePage } from '../model/love/office-page'

test.use({ storageState: PlatformSetting })
const ws = 'meetings-ws'

test('my test', async ({ page }) => {
  const officePage = new OfficePage(page)
  await page.goto(`${PlatformURI}/workbench/${ws}`)
  await officePage.navigateToOffice()
  // ...
})
```

### Config

- Playwright config: `tests/sanity/tests/playwright.config.ts`
- `testIdAttribute: 'data-id'`
- Timeouts: test=60s, expect=15s
- Browser: Desktop Chrome 1440x900

## LiveKit Integration

For tests needing actual WebRTC (meeting start/join/leave):
- LiveKit must run locally on Mac
- Config: `dev/livekit-dev-config.yaml`
- Love service connects to LiveKit via `LIVEKIT_HOST` env var
- Tests should tag `@livekit` for conditional run:
  ```typescript
  test('start meeting @livekit', async ({ page }) => { ... })
  ```

## Key Decisions

- `meetings-ws` workspace used for all love tests (separate from `sanity-ws`)
- Page objects follow existing pattern: extend CommonPage, locators as arrow functions
- data-id attributes added incrementally as tests are written
- LiveKit tests are opt-in via tag, not required for basic UI tests
