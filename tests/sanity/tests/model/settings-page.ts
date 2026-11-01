import { expect, type Locator } from '@playwright/test'
import { CommonPage } from './common-page'
import { SpaceTypes } from './types'
import { retryIntervals } from '../retry'

export class SettingsPage extends CommonPage {
  profileButton = (): Locator => this.page.locator('#profile-button')
  settingsButton = (): Locator => this.page.getByRole('button', { name: 'Settings', exact: true })
  spaceTypesHeader = (): Locator => this.page.locator('button.hulyNavGroup-header', { hasText: 'Space types' })
  newSpaceTypeButton = (): Locator => this.page.locator('#new-space-type')
  popupSelectSpaceTypeButton = (): Locator =>
    this.page.locator('form#setting\\:string\\:NewSpaceType div#selectSpaceType button')

  popupSpaceTypeNameInput = (): Locator =>
    this.page.locator('form#setting\\:string\\:NewSpaceType').getByPlaceholder('Space type', { exact: true })

  popupCreateButton = (): Locator =>
    this.page.locator('form#setting\\:string\\:NewSpaceType div.antiCard-footer button', { hasText: 'Create' })

  spaceTypeButton = (name: string, category?: string): Locator =>
    this.page.locator('div#navGroup-spaceTypes button.hulyTaskNavLink-container', {
      hasText: category !== undefined ? `${name} ${category}` : name
    })

  breadcrumbButton = (hasText: string): Locator => this.page.locator('button.hulyBreadcrumb-container', { hasText })
  stateButton = (name: string): Locator =>
    this.page
      .locator('div.hulyTableAttr-header', { hasText: 'Process states' })
      .locator('xpath=..')
      .locator('button.hulyTableAttr-content__row', { hasText: name })

  statusNameInput = (): Locator =>
    this.page
      .locator('div.hulyModal-container.type-aside', { hasText: /Edit state|Create state/ })
      .getByPlaceholder('Status name')

  selectColorButton = (name: string): Locator =>
    this.page.locator('div.hulyTableAttr-container', { hasText: 'Color' }).locator(`div.color[data-id="${name}"]`)

  selectIconButton = (): Locator => this.page.locator('button[data-id="btnSelectIcon"]')
  emojiSectionButton = (): Locator => this.page.locator('div.popup div.tab', { hasText: 'Emoji' })
  // Scoped and exact: a substring match on the accessible name also hit the navigator row of a
  // task type already carrying this emoji, and being first in DOM order that is what was clicked.
  emojiIconButton = (hasText: string): Locator =>
    this.page.locator('.hulyPopup-container').getByRole('button', { name: hasText, exact: true }).first()

  // Exact name: a new tracker type already has "Classic Issue", which a substring "Issue" would also match
  taskTypeRow = (value: string): Locator =>
    this.page
      .locator('div.hulyTableAttr-header', { hasText: 'Task types' })
      .locator('xpath=..')
      .locator('div.hulyTableAttr-content button.hulyTableAttr-content__row')
      .filter({ has: this.page.getByText(value, { exact: true }) })

  deleteStateButton = (): Locator =>
    this.page.locator('div.hulyModal-container.type-aside .hulyHeader-buttonsGroup.actions button').first()

  addStateButton = (): Locator =>
    this.page
      .locator('div.hulyTableAttr-header', { hasText: 'Process states' })
      .locator('button:not([data-id="btnAddExistingStatus"])')

  addTaskTypeButton = (): Locator =>
    this.page.locator('div.hulyTableAttr-header', { hasText: 'Task types' }).locator('button[data-id="btnAdd"]')

  taskNameInput = (): Locator => this.page.getByPlaceholder('Task type name')
  parentTypeAddButton = (): Locator =>
    this.page.locator('div.hulyModal-content__settingsSet-line', { hasText: 'Parent' }).locator('button')

  parentTypeItem = (name: string): Locator => this.page.locator('div.selectPopup button', { hasText: name })

  asideFooterButton = (hasText: string): Locator =>
    this.page.locator('div.hulyModal-container.type-aside div.hulyModal-footer button', { hasText })

  buttonRoleInComponent = (hasText: string): Locator =>
    this.page.locator('div.hulyComponent-content > div.flex-row-center', { hasText }).locator('button')

  async clickButtonRoleInComponent (name: string): Promise<void> {
    await this.buttonRoleInComponent(name).click()
  }

  async navigateToWorkspace (workspaceUrl: string): Promise<void> {
    const response = await this.page.goto(workspaceUrl)
    if (response === null || response === undefined) {
      throw new Error(`Failed to navigate to ${workspaceUrl}`)
    }
    await response.finished()
  }

  async openProfileMenu (): Promise<void> {
    await this.profileButton().click()
  }

  async openSettings (): Promise<void> {
    // The app finishes booting behind the profile menu and the re-render closes it, so the item can
    // disappear between opening the menu and clicking it.
    await expect(async () => {
      if ((await this.settingsButton().count()) === 0) await this.openProfileMenu()
      await this.settingsButton().click({ timeout: 5000 })
    }).toPass({ intervals: retryIntervals, timeout: 30000 })
  }

  async clickAddSpaceType (): Promise<void> {
    await this.newSpaceTypeButton().click()
  }

  async createSpaceType (name: string, spaceType?: SpaceTypes): Promise<void> {
    await this.spaceTypesHeader().hover()
    await this.newSpaceTypeButton().click()
    if (spaceType !== undefined) {
      await this.popupSelectSpaceTypeButton().click()
      await this.selectPopupMenu(spaceType).click()
    }
    await this.popupSpaceTypeNameInput().fill(name)
    await this.popupCreateButton().click()
  }

  async selectSpaceType (name: string, category?: string): Promise<void> {
    await this.spaceTypeButton(name, category).click()
  }

  async addTaskType (name: string, parentTypeName?: string): Promise<void> {
    await this.addTaskTypeButton().click()
    await this.taskNameInput().fill(name)
    if (parentTypeName !== undefined) {
      await this.parentTypeAddButton().click()
      await this.parentTypeItem(parentTypeName).click()
    }
    await this.asideFooterButton('Create').click()
    await expect(this.taskTypeRow(name)).toBeVisible()
  }

  async checkTaskType (name: string): Promise<void> {
    await expect(this.taskTypeRow(name)).toBeVisible()
  }

  async openTaskType (name: string): Promise<void> {
    await this.taskTypeRow(name).click()
  }

  async checkOpened (breadcrumbOne: string, breadcrumbTwo?: string): Promise<void> {
    if (breadcrumbTwo !== undefined) await expect(this.breadcrumbButton(breadcrumbTwo)).toBeVisible()
    await expect(this.breadcrumbButton(breadcrumbOne)).toBeVisible()
  }

  async checkState (name: string): Promise<void> {
    await expect(this.stateButton(name)).toBeVisible()
  }

  // Adds a status (category Active) to the opened task type
  async addState (name: string): Promise<void> {
    await this.addStateButton().click()
    await this.statusNameInput().fill(name)
    await this.asideFooterButton('Create').click()
    await expect(this.statusNameInput()).toBeHidden()
    await expect(this.stateButton(name)).toBeVisible()
  }

  // Deletes an unused state of the opened task type
  async deleteState (name: string): Promise<void> {
    await this.stateButton(name).click()
    await this.deleteStateButton().click()
    await this.viewStringDeleteObjectButtonPrimary().click()
    // The state panel closes once the state is deleted
    await expect(this.statusNameInput()).toBeHidden()
    await expect(this.stateButton(name)).toHaveCount(0)
  }

  async changeState (name: string, newName: string, color?: string): Promise<void> {
    await this.stateButton(name).click()
    expect(await this.statusNameInput().inputValue()).toContain(name)
    await this.statusNameInput().fill(newName)
    if (color !== undefined) await this.selectColorButton(color).click()
    await this.asideFooterButton('Save').click()
    // The panel closes when the save lands; a rename in place keeps the id, so a click on the
    // renamed row before that is a no-op and the next action hits the closing panel.
    await expect(this.statusNameInput()).toBeHidden()
  }

  async changeIcon (): Promise<void> {
    await this.selectIconButton().click()
    await this.emojiIconButton('👀').click()
  }

  // Statuses section of a project type (not the "Process states" list of a task type)
  addProjectTypeStatusButton = (): Locator => this.page.locator('button[data-id="btnAddProjectTypeStatus"]')
  projectStatusRow = (name: string): Locator =>
    this.page
      .locator('div.hulyTableAttr-content.class.withTitle button.hulyTableAttr-content__row')
      .filter({ has: this.page.getByText(name, { exact: true }) })

  statusEditorAside = (): Locator => this.page.locator('div.hulyModal-container.type-aside')

  // Delete buttons of the status confirmation and the merge confirmation share this label
  popupDeleteButton = (): Locator => this.page.locator('div.popup').getByRole('button', { name: 'Delete', exact: true })

  orphansBlock = (): Locator => this.page.locator('div.orphans')
  orphanRow = (name: string): Locator =>
    this.orphansBlock()
      .locator('div.hulyTableAttr-content__row')
      .filter({ has: this.page.getByText(name, { exact: true }) })

  deleteSpaceTypeButton = (): Locator =>
    this.page.locator('div.hulyComponent-content__header > div.flex-row').locator('button').last()

  // Removes the opened project type; its statuses stay in the workspace
  async deleteOpenedSpaceType (): Promise<void> {
    await expect(this.deleteSpaceTypeButton()).toBeVisible()
    await this.deleteSpaceTypeButton().click()
    await this.page.locator('div.popup').getByRole('button', { name: 'Ok', exact: true }).click()
  }

  // Hierarchy section of the opened task type: the first group holds parents, the last one children
  hierarchyParents = (): Locator => this.page.locator('.hierarchy-section .group').first()
  hierarchyChildren = (): Locator => this.page.locator('.hierarchy-section .group').last()
  hierarchyChip = (group: Locator, name: string): Locator =>
    group.locator('.chip').filter({ has: this.page.getByText(name, { exact: true }) })

  async addHierarchyType (group: Locator, name: string): Promise<void> {
    await group.locator('.side button').first().click()
    await this.parentTypeItem(name).click()
    await expect(this.hierarchyChip(group, name)).toBeVisible()
  }

  async removeHierarchyType (group: Locator, name: string): Promise<void> {
    await this.hierarchyChip(group, name).locator('button').last().click()
    await expect(this.hierarchyChip(group, name)).toHaveCount(0)
  }

  async addProjectTypeStatus (name: string): Promise<void> {
    await this.addProjectTypeStatusButton().click()
    await this.statusEditorAside().getByPlaceholder('Status name').fill(name)
    await this.asideFooterButton('Create').click()
    await expect(this.projectStatusRow(name)).toBeVisible()
  }
}
