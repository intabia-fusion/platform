import { expect, test } from '@playwright/test'
import { PlatformSetting, PlatformURI, getSecondPage } from '../utils'
import { setWorkspacePlan } from '../API/Billing'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { generateProjectId } from '../tracker/tracker.utils'

// ── A. disk limit (honest upload) ───────────────────────────────────────────
test.describe('disk limit (honest upload)', () => {
  test.use({ storageState: PlatformSetting })

  test('uploading beyond the storage limit is rejected', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/limits-disk-ws/tracker`))?.finished()

    const trackerNav = new TrackerNavigationMenuPage(page)
    await trackerNav.openIssuesForProject('Default')

    // The chip in the New Issue form appears as soon as the file is selected (before the upload
    // resolves), so it does not signal rejection. Watch for the datalake 413 instead — that is the
    // honest "storage limit exceeded" response the user's StorageLimitReached toast is built on.
    let rejected = false
    page.on('response', (r) => {
      if (r.status() === 413 && r.url().includes('/upload/')) {
        rejected = true
      }
    })

    // Attach 0.5 MB chunks into the New Issue form. After crossing the (1 MB) limit the server
    // rejects the upload. Billing recompute is async (~1 s), so keep uploading until 413.
    const CHUNK = 512 * 1024 // 0.5 MB
    const fileInput = page.locator('form[id="tracker:string:NewIssue"] input[type="file"]#file')
    // The button toggles to "Resume draft" once a draft exists, so open via id (either variant).
    const openForm = page.locator('#tracker-string-NewIssue, #tracker-string-ResumeDraft')

    for (let i = 0; i < 12; i++) {
      if (rejected) break // set asynchronously by the response listener above
      const fileName = `big-${i}.bin`
      // Unique content per file — billing dedups storage deltas by sha256, so identical zero-filled
      // buffers would all collapse to one chunk and never cross the limit via the delta path.
      const buffer = Buffer.alloc(CHUNK, i + 1)
      await openForm.first().click()
      await fileInput.setInputFiles({ name: fileName, mimeType: 'application/octet-stream', buffer })
      await page.waitForTimeout(2000) // let the upload resolve + billing record used storage
      await page.keyboard.press('Escape')
    }

    expect(rejected).toBe(true)
  })
})

// ── B. unpaid runs on free fallback (chip, not hard read-only) ───────────────
// Free fallback is always configured, so an unpaid workspace shows the free-plan chip and stays
// usable on free limits — it is NOT put into full read-only. (Seat over-limit read-only is block F.)
test.describe('unpaid free fallback', () => {
  test.use({ storageState: PlatformSetting })

  test('past-due workspace shows the free-plan chip, not read-only; chip clears after payment', async ({ page }) => {
    await setWorkspacePlan('limits-unpaid-ws', 'start', { status: 'past_due' })

    await expect(async () => {
      await (await page.goto(`${PlatformURI}/workbench/limits-unpaid-ws`))?.finished()
      await expect(page.locator('[data-id="billingFreePlanBanner"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-id="billingReadOnlyBanner"]')).toBeHidden({ timeout: 5000 })
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 30000 })

    // Simulate payment: set subscription back to active -> chip disappears.
    await setWorkspacePlan('limits-unpaid-ws', 'start', { status: 'active' })
    await expect(async () => {
      await (await page.goto(`${PlatformURI}/workbench/limits-unpaid-ws`))?.finished()
      await expect(page.locator('[data-id="billingFreePlanBanner"]')).toBeHidden({ timeout: 5000 })
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 30000 })
  })

  test('admin-canceled subscription also runs on the free fallback (chip, not read-only)', async ({ page }) => {
    await setWorkspacePlan('limits-unpaid-ws', 'start', { status: 'active' })
    await (await page.goto(`${PlatformURI}/workbench/limits-unpaid-ws`))?.finished()
    await expect(page.locator('[data-id="billingFreePlanBanner"]')).toBeHidden({ timeout: 15000 })

    await setWorkspacePlan('limits-unpaid-ws', 'start', { status: 'canceled' })
    await expect(async () => {
      await (await page.goto(`${PlatformURI}/workbench/limits-unpaid-ws`))?.finished()
      await expect(page.locator('[data-id="billingFreePlanBanner"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-id="billingReadOnlyBanner"]')).toBeHidden({ timeout: 5000 })
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 30000 })

    // Restore active so the workspace is clean for re-runs.
    await setWorkspacePlan('limits-unpaid-ws', 'start', { status: 'active' })
  })
})

// ── C. plan upgrade lifts counted block ──────────────────────────────────────
test.describe('plan upgrade lifts counted block', () => {
  test.use({ storageState: PlatformSetting })

  test('upgrading projects limit lifts the dialog block', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/limits-ws/tracker`))?.finished()

    const trackerNav = new TrackerNavigationMenuPage(page)
    const newProjectPage = new NewProjectPage(page)
    const submit = page.locator('form[id="tracker:string:NewProject"] button[type="submit"]')

    // At projectsLimit=1 (Default fills it) the create dialog blocks submit.
    await trackerNav.pressCreateProjectButton()
    await newProjectPage.fillProjectFields({ title: `upg-${generateProjectId()}`, identifier: generateProjectId() })
    await expect(page.locator('[data-id="projectLimitError"]')).toBeVisible({ timeout: 10000 })
    await expect(submit).toBeDisabled()
    await page.keyboard.press('Escape')

    // Upgrade the plan to allow 10 projects.
    await setWorkspacePlan('limits-ws', 'start', { projects: 10 })

    // Poll (reload) until the store picks up the new limit and a project can be created.
    await expect(async () => {
      await (await page.goto(`${PlatformURI}/workbench/limits-ws/tracker`))?.finished()
      const title = `after-upgrade-${generateProjectId()}`
      await trackerNav.pressCreateProjectButton()
      await newProjectPage.createNewProject({ title, identifier: generateProjectId() })
      await expect(page.getByRole('button', { name: title, exact: true }).first()).toBeVisible({ timeout: 5000 })
    }).toPass({ intervals: [3000, 5000, 5000], timeout: 60000 })
  })
})

// ── D. limits indicator ───────────────────────────────────────────────────────
test.describe('limits indicator', () => {
  test.use({ storageState: PlatformSetting })

  test('owner sees limits indicator and usage popup', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/limits-ws/tracker`))?.finished()

    const indicator = page.locator('[data-id="billingLimitsIndicator"]')
    await expect(indicator).toBeVisible({ timeout: 15000 })

    await indicator.hover()
    await expect(page.locator('[data-id="billingUsageSection"]')).toBeVisible({ timeout: 5000 })
  })
})

// ── E. subscribe / switch plan via UI (mock provider) ────────────────────────
// Exercises the real UI button -> mock checkout (instant active) -> plan-change path.
// Covers the mock checkoutUrl + plan-change lookup bugs end to end.
test.describe('subscribe and switch plan via UI', () => {
  test.use({ storageState: PlatformSetting })

  async function openBilling (page: import('@playwright/test').Page, ws: string): Promise<void> {
    await (await page.goto(`${PlatformURI}/workbench/${ws}/setting/setting/billing/subscriptions`))?.finished()
    // Wait for plan cards (plan-config loaded).
    await expect(page.locator('[data-id="planCard-storage-mini"]')).toBeVisible({ timeout: 20000 })
  }

  // Switching between two existing plans opens a MessageBox confirm (Confirm Upgrade/Downgrade);
  // creating a first subscription does not. Confirm if the dialog appears, ignore otherwise.
  async function confirmIfDialog (page: import('@playwright/test').Page): Promise<void> {
    const ok = page.locator('.msgbox-container .footer button').filter({ hasText: 'Ok' })
    try {
      await ok.first().click({ timeout: 4000 })
    } catch {
      /* no confirm dialog (first-time subscribe) */
    }
  }

  // Click a plan's Subscribe/ChangePlan, confirm the dialog. The mock provider activates instantly
  // (instant=true) so the dialog refetches in place — no redirect — and the plan becomes current.
  async function switchToPlan (page: import('@playwright/test').Page, planKey: string): Promise<void> {
    await page.locator(`[data-id="planSubscribe-${planKey}"]`).click()
    await confirmIfDialog(page)
    await expect(page.locator(`[data-id="planSubscribe-${planKey}"]`)).toHaveCount(0, { timeout: 15000 })
  }

  test('switch from storage-mini to storage-medium and back activates instantly', async ({ page }) => {
    // Known baseline: storage-mini active (admin path).
    await setWorkspacePlan('limits-switch-ws', 'storage-mini', { status: 'active' })

    await openBilling(page, 'limits-switch-ws')
    await expect(page.locator('[data-id="planSubscribe-storage-mini"]')).toHaveCount(0, { timeout: 10000 })

    await switchToPlan(page, 'storage-medium')
    await expect(page.locator('[data-id="planSubscribe-storage-mini"]')).toBeVisible({ timeout: 5000 })

    await switchToPlan(page, 'storage-mini')
  })
})

// ── F. seat downgrade puts the over-limit member into read-only ──────────────
// limits-seat-ws starts with usersLimit=2 (user1 OWNER + user2 USER, both onboarded).
// Downgrading to usersLimit=1 leaves the owner (priority seat) active and pushes user2
// over the limit -> read-only banner for user2, none for the owner.
test.describe('seat downgrade read-only', () => {
  test('downgrading to 1 seat keeps the owner active and makes the second member read-only', async ({ browser }) => {
    // Ensure both members finished onboarding while two seats were available.
    await setWorkspacePlan('limits-seat-ws', 'start', { users: 2 })

    const ownerContext = await browser.newContext({ storageState: PlatformSetting })
    const ownerPage = await ownerContext.newPage()
    using member = await getSecondPage(browser)
    const memberPage = member.page

    // Both load the workspace -> Employee mixins become active, no banner while 2 seats exist.
    await (await ownerPage.goto(`${PlatformURI}/workbench/limits-seat-ws`))?.finished()
    await (await memberPage.goto(`${PlatformURI}/workbench/limits-seat-ws`))?.finished()
    await expect(memberPage.locator('[data-id="billingReadOnlyBanner"]')).toBeHidden({ timeout: 15000 })

    // Downgrade to a single seat.
    await setWorkspacePlan('limits-seat-ws', 'start', { users: 1 })

    // The second member (lower priority than the owner) loses the seat -> read-only banner.
    await expect(async () => {
      await (await memberPage.goto(`${PlatformURI}/workbench/limits-seat-ws`))?.finished()
      await expect(memberPage.locator('[data-id="billingReadOnlyBanner"]')).toBeVisible({ timeout: 5000 })
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 40000 })

    // The owner keeps the seat -> no banner.
    await (await ownerPage.goto(`${PlatformURI}/workbench/limits-seat-ws`))?.finished()
    await expect(ownerPage.locator('[data-id="billingReadOnlyBanner"]')).toBeHidden({ timeout: 10000 })

    // Restore two seats for re-runs.
    await setWorkspacePlan('limits-seat-ws', 'start', { users: 2 })
    await ownerContext.close()
  })
})
