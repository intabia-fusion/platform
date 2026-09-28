// `custom-attributes.spec.ts` is skipped; checkIfClassesExists() asserts mixin entries
// (defaultFunnel/defaultVacancy) now in the panel's MIXINS section - drop if unskipped.

import { expect, test } from '../fixtures'
import { createAccountAndWorkspace, generateTestData } from '../utils'
import { faker } from '@faker-js/faker'
import { WorkspaceSettingsPage, ButtonType } from '../model/workspace/workspace-settings-page'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { ClassMixinsPage } from './class-mixins-page'

test.describe('Class mixins tests', () => {
  let userProfilePage: UserProfilePage
  let workspaceSettingsPage: WorkspaceSettingsPage
  let classMixinsPage: ClassMixinsPage
  let data: { workspaceName: string, userName: string, firstName: string, lastName: string, channelName: string }

  test.beforeEach(async ({ page, request }) => {
    data = generateTestData()
    userProfilePage = new UserProfilePage(page)
    workspaceSettingsPage = new WorkspaceSettingsPage(page)
    classMixinsPage = new ClassMixinsPage(page)
    // Straight into the workspace from the account token: the login form plus the workspace
    // picker are three page loads and cost about a second per test.
    await createAccountAndWorkspace(page, request, data)
  })

  test('create mixin on a class and verify it appears', async () => {
    const mixinName = faker.word.words()
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.createMixin(mixinName)
  })

  test('delete mixin', async () => {
    const mixinName = faker.word.words()
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.createMixin(mixinName)

    await classMixinsPage.deleteMixin(mixinName)
    await expect(classMixinsPage.mixinChip(mixinName)).not.toBeVisible()
  })
})
