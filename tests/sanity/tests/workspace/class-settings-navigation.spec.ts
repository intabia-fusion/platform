import { expect, test, type Page } from '../fixtures'
import { generateId, loginByToken } from '../utils'
import { ContractPage } from '../model/contacts/contract-page'
import { UserProfilePage } from '../model/profile/user-profile-page'

// Settings sidebar navigator renders only while the Settings app is active
// (WorkspaceSettings.svelte); NavGroup id is `navGroup-${categoryName}`, here 'setting'.
const settingsNavGroup = (page: Page): ReturnType<Page['locator']> => page.locator('#navGroup-setting')

test.describe('workbench navigation after class settings tests', () => {
  let userProfilePage: UserProfilePage
  let contractPage: ContractPage

  test.beforeEach(async ({ page, sharedWorkspace }) => {
    userProfilePage = new UserProfilePage(page)
    contractPage = new ContractPage(page)
    const shared = await sharedWorkspace()
    await loginByToken(page, shared.token, shared.ws)
  })

  test('back from class settings restores the app navigator', async ({ page }) => {
    const first = 'Elton-' + generateId(5)
    const last = 'John-' + generateId(5)

    await contractPage.clickAppContact()
    await contractPage.clickEmployeeNavElement('Person')
    await contractPage.clickEmployeeButton('Person')
    await contractPage.clickFirstNameInput()
    await contractPage.fillFirstNameInput(first)
    await contractPage.clickLastNameInput()
    await contractPage.fillLastNameInput(last)
    await contractPage.clickCreateButton()
    await contractPage.waitForFormAntiCardDetached()

    await contractPage.clickOnEmployee(first, last)
    const contactUrl = new URL(page.url())

    // Baseline: Contacts navigator visible, Settings sidebar not present.
    await expect(contractPage.employeeNavElement('Person')).toBeVisible()
    await expect(settingsNavGroup(page)).toHaveCount(0)

    await page.locator('button[data-id="btnClassSetting"]').click()
    await expect(page).toHaveURL(/setting\/setting\/classes/)
    await expect(page).toHaveURL(/_class=/)

    await page.goBack()

    // Compare path + panel fragment rather than the full URL: the query string
    // is incidental, the app path and open doc panel are what must be restored.
    const backUrl = new URL(page.url())
    expect(backUrl.pathname).toBe(contactUrl.pathname)
    expect(backUrl.hash).toBe(contactUrl.hash)
    await expect(settingsNavGroup(page)).toHaveCount(0)
    await expect(contractPage.employeeNavElement('Person')).toBeVisible()
  })

  test('settings opened from the profile menu restores the app navigator on back', async ({ page }) => {
    await contractPage.clickAppContact()
    const contactAppUrl = new URL(page.url())
    await expect(contractPage.employeeNavElement('Person')).toBeVisible()

    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()

    // Profile menu opens Settings app at /workbench/<ws>/setting[/<category>] (single 'setting').
    await expect(page).toHaveURL(/\/setting(\/|$)/)
    await expect(settingsNavGroup(page)).toBeVisible()

    await page.goBack()

    const backUrl = new URL(page.url())
    expect(backUrl.pathname).toBe(contactAppUrl.pathname)
    await expect(settingsNavGroup(page)).toHaveCount(0)
    await expect(contractPage.employeeNavElement('Person')).toBeVisible()
  })
})
