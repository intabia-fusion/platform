import { test, expect } from './fixtures'
import { PlatformUser, checkIfUrlContains } from './utils'
import { retryIntervals } from './retry'
import { LoginPage } from './model/login-page'
import { SelectWorkspacePage } from './model/select-workspace-page'
import { CommonTrackerPage } from './model/tracker/common-tracker-page'
import { TrackerNavigationMenuPage } from './model/tracker/tracker-navigation-menu-page'
import { OtpPage } from './model/otp-page'

test.describe('login test', () => {
  let loginPage: LoginPage
  let commonTrackerPage: CommonTrackerPage
  let trackerNavigationMenuPage: TrackerNavigationMenuPage
  let selectWorkspacePage: SelectWorkspacePage

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    loginPage = new LoginPage(page)
    commonTrackerPage = new CommonTrackerPage(page)
    trackerNavigationMenuPage = new TrackerNavigationMenuPage(page)
    selectWorkspacePage = new SelectWorkspacePage(page)
    await loginPage.goto()
  })

  test('password login works without consent in a clean browser', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('login-consent-personal-data')
      localStorage.removeItem('login-consent-rules')
    })
    await loginPage.switchToPasswordIfNeeded()
    await expect(page.locator('[data-testid="checkbox-personal-data"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="checkbox-rules"]')).toHaveCount(0)
    await loginPage.login(PlatformUser, '1234')
    await selectWorkspacePage.selectWorkspace('sanity-ws')
    await commonTrackerPage.checkIfMainPanelIsVisible()
    await trackerNavigationMenuPage.checkIfTrackerSidebarIsVisible()
  })

  test('check login with wrong user and if the button is disabled ', async ({ page }) => {
    await loginPage.checkIfLoginButtonIsDisabled()
    await loginPage.login(PlatformUser, 'wrong-password')
    // Wait a bit for the error message to appear after login attempt
    await expect(async () => {
      await loginPage.checkIfErrorMessageIsShown('wrong-credentials')
    }).toPass({ intervals: retryIntervals, timeout: 30000 })
  })

  test('login with code for an unknown user shows the code screen like for a known one', async ({ page }) => {
    const unknown = `unknown-${Date.now()}@test.local`
    await loginPage.enableOtp()
    await loginPage.goto()
    await loginPage.loginWithCode(unknown)
    await new OtpPage(page).checkIfCodeScreenIsShown(unknown)
  })

  test('check if user is able to go to recovery and back to login', async ({ page }) => {
    await checkIfUrlContains(page, '/login')
    await loginPage.checkIfLoginButtonIsDisabled()
    await loginPage.checkIfLoginButtonIsDisabled()
    await loginPage.clickOnRecover()
    await checkIfUrlContains(page, '/password')
    await loginPage.checkIfPasswordRecoveryIsVisible()
    await loginPage.clickOnRecoveryLogin()
    await checkIfUrlContains(page, '/login')
    await loginPage.checkIfLoginButtonIsDisabled()
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveCount(0)
  })
})
