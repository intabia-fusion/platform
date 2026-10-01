// `custom-attributes.spec.ts` is skipped; checkIfClassesExists() asserts mixin entries
// (defaultFunnel/defaultVacancy) now in the panel's MIXINS section - drop if unskipped.

import { expect, test } from '../fixtures'
import { generateId, loginByToken } from '../utils'
import { faker } from '@faker-js/faker'
import { WorkspaceSettingsPage, ButtonType } from '../model/workspace/workspace-settings-page'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { ClassMixinsPage } from './class-mixins-page'

test.describe('Class mixins tests', () => {
  let userProfilePage: UserProfilePage
  let workspaceSettingsPage: WorkspaceSettingsPage
  let classMixinsPage: ClassMixinsPage

  test.beforeEach(async ({ page, sharedWorkspace }) => {
    userProfilePage = new UserProfilePage(page)
    workspaceSettingsPage = new WorkspaceSettingsPage(page)
    classMixinsPage = new ClassMixinsPage(page)
    const shared = await sharedWorkspace()
    await loginByToken(page, shared.token, shared.ws)
  })

  test('create mixin on a class and verify it appears', async () => {
    const mixinName = `${faker.word.words()} ${generateId(5)}`
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.createMixin(mixinName)
  })

  test('delete mixin', async () => {
    const mixinName = `${faker.word.words()} ${generateId(5)}`
    await userProfilePage.openProfileMenu()
    await userProfilePage.clickSettings()
    await workspaceSettingsPage.selectWorkspaceSettingsTab(ButtonType.Classes)
    await classMixinsPage.selectClass('Company')
    await classMixinsPage.createMixin(mixinName)

    await classMixinsPage.deleteMixin(mixinName)
    await expect(classMixinsPage.mixinChip(mixinName)).not.toBeVisible()
  })
})
