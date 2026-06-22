import { expect, test } from '@playwright/test'
import { PlatformSetting, PlatformSettingSecond, PlatformURI, generateId } from '../utils'
import { ApiEndpoint } from '../API/Api'
import { setWorkspacePlanByUuid } from '../API/Billing'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { generateProjectId } from '../tracker/tracker.utils'

// Each test provisions its own fresh workspace on plan 'start' (projectsLimit=1). user1 is OWNER.
// The built-in Default project is system-created and does not consume the project limit.
test.describe('Plan limits', () => {
  test.describe('counted limits (owner)', () => {
    test.use({ storageState: PlatformSetting })

    let trackerNavigationMenuPage: TrackerNavigationMenuPage
    let newProjectPage: NewProjectPage
    let wsUrl: string

    test.beforeEach(async ({ page, request }) => {
      trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
      newProjectPage = new NewProjectPage(page)
      const api = new ApiEndpoint(request)
      const wsInfo = await api.createWorkspaceWithLogin(`limits-cnt-${generateId(8)}`, 'user1', '1234')
      wsUrl = wsInfo.workspaceUrl
      await setWorkspacePlanByUuid(wsInfo.workspace, 'start', { projects: 1 })
      await (await page.goto(`${PlatformURI}/workbench/${wsUrl}/tracker`))?.finished()
    })

    test('project creation beyond plan limit is blocked in the dialog', async ({ page }) => {
      // projectsLimit=1; the built-in Default project already fills the slot, so the
      // create dialog blocks the submit button and shows the limit error before any server call.
      await trackerNavigationMenuPage.pressCreateProjectButton()
      const title = `plan-limit-${generateProjectId()}`
      await newProjectPage.fillProjectFields({ title, identifier: generateProjectId() })

      await expect(page.locator('[data-id="projectLimitError"]')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('form[id="tracker:string:NewProject"] button[type="submit"]')).toBeDisabled()

      await page.keyboard.press('Escape')
    })
  })

  test.describe('seat limit banner (seatless member)', () => {
    test.use({ storageState: PlatformSettingSecond })

    // Blocked on the server-side ensureEmployee work: a seatless member's first-login onboarding
    // (own Person/Employee write) is currently rejected by SeatLimitsMiddleware, so user2 cannot
    // load the workbench at all. Re-enable once onboarding runs under an elevated server identity.
    // See foundation-tasks/billing-limits.md "серверный ensureEmployee".
    test.fixme('seatless member sees the read-only banner', async ({ page }) => {
      await (await page.goto(`${PlatformURI}/workbench/limits-ws`))?.finished()
      // user2 holds no seat (usersLimit=1, taken by the owner) -> ReadOnlyBanner is shown.
      await expect(page.locator('[data-id="billingReadOnlyBanner"]')).toBeVisible({ timeout: 15000 })
    })
  })
})
