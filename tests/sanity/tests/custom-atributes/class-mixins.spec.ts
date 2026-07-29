// NOTE: `custom-attributes.spec.ts` is `test.describe.skip` and its
// `CustomAttributesPage.checkIfClassesExists()` asserts mixin entries
// (`defaultFunnel`, `defaultVacancy`) as nav buttons. Mixins are no longer
// shown as separate nav items (they moved into the class panel's MIXINS
// section), so if that test is un-skipped these two assertions must be
// dropped.

import { expect, test } from '@playwright/test'
import { PlatformURI, generateTestData } from '../utils'
import { ApiEndpoint } from '../API/Api'
import { LoginPage } from '../model/login-page'
import { faker } from '@faker-js/faker'
import { WorkspaceSettingsPage, ButtonType } from '../model/workspace/workspace-settings-page'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { ClassMixinsPage } from './class-mixins-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'

test.describe('Class mixins tests', () => {
  let loginPage: LoginPage
  let userProfilePage: UserProfilePage
  let workspaceSettingsPage: WorkspaceSettingsPage
  let classMixinsPage: ClassMixinsPage
  let api: ApiEndpoint
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }

  test.beforeEach(async ({ page, request }) => {
    data = generateTestData()
    loginPage = new LoginPage(page)
    userProfilePage = new UserProfilePage(page)
    workspaceSettingsPage = new WorkspaceSettingsPage(page)
    classMixinsPage = new ClassMixinsPage(page)
    api = new ApiEndpoint(request)
    await api.createAccount(data.userName, '1234', data.firstName, data.lastName)
    await api.createWorkspaceWithLogin(data.workspaceName, data.userName, '1234')
    await (await page.goto(`${PlatformURI}`))?.finished()
    await loginPage.login(data.userName, '1234')
    const swp = new SelectWorkspacePage(page)
    await swp.selectWorkspace(data.workspaceName)
  })

  test('create mixin on a class and verify it appears', async () => {
    const mixinName = faker.word.words()
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.clickCreateMixin()
    await classMixinsPage.fillMixinName(mixinName)
    await classMixinsPage.clickCreatePopupButton()
    await classMixinsPage.checkMixinExists(mixinName)
  })

  test('delete mixin', async () => {
    const mixinName = faker.word.words()
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.clickCreateMixin()
    await classMixinsPage.fillMixinName(mixinName)
    await classMixinsPage.clickCreatePopupButton()
    await classMixinsPage.checkMixinExists(mixinName)

    await classMixinsPage.deleteMixin(mixinName)
    await expect(classMixinsPage.mixinChip(mixinName)).not.toBeVisible()
  })
})
