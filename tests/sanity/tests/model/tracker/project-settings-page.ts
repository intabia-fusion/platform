import { expect, type Locator } from '@playwright/test'
import { CommonTrackerPage } from './common-tracker-page'
import { NewProject } from './types'

export type ProjectSettingsSection = 'general' | 'members' | 'issues' | 'statuses' | 'workflow' | 'archive'

/** Project settings page of the tracker: sections on the left, every change is saved at once. */
export class ProjectSettingsPage extends CommonTrackerPage {
  root = (): Locator => this.page.locator('[data-id="project-settings"]')
  buttonOpenSettings = (): Locator => this.page.locator('button[data-id="btnProjectSettings"]')
  buttonBack = (): Locator => this.page.locator('button[data-id="btnBackToProject"]')
  buttonClose = (): Locator => this.page.locator('button[data-id="btnCloseProjectSettings"]')
  navItem = (section: ProjectSettingsSection): Locator =>
    this.page.locator(`[data-id="project-settings-nav-${section}"] button`)

  inputTitle = (): Locator => this.root().locator('input#project-title')
  inputIdentifier = (): Locator => this.root().locator('input#project-identifier')
  inputDescription = (): Locator => this.root().locator('textarea#project-description')
  // The kit Toggle puts the id on its native switch input, which lies over the drawn track
  togglePrivate = (): Locator => this.root().locator('input#project-private')
  accessError = (): Locator => this.root().locator('[data-id="project-settings-access-error"]')

  projectType = (): Locator => this.root().locator('[data-id="project-type"]')
  defaultAssigneeButton = (): Locator => this.root().locator('button[data-id="project-default-assignee"]')
  defaultIssueStatusButton = (): Locator => this.root().locator('button[data-id="project-default-status"]')
  buttonArchive = (): Locator => this.page.locator('button[data-id="btnArchiveProject"]')
  buttonAddMember = (): Locator => this.root().locator('[data-id="project-add-member"]')
  memberRow = (name: string): Locator => this.root().locator('[data-id="project-settings-member"]', { hasText: name })

  statusRows = (): Locator =>
    this.root().locator('[data-id="project-settings-statuses"] .hulyTableAttr-content__row:not(.disableMouseOver)')

  async openFromProject (): Promise<void> {
    await this.buttonOpenSettings().click()
    await expect(this.root()).toBeVisible()
  }

  async openSection (section: ProjectSettingsSection): Promise<void> {
    await this.navItem(section).click()
    await expect(this.root().locator(`[data-id="project-settings-${section}"]`)).toBeVisible()
  }

  /** The value is saved when the field loses focus. */
  async fillAndCommit (input: Locator, value: string): Promise<void> {
    await input.fill(value)
    await input.press('Tab')
  }

  async setTitle (title: string): Promise<void> {
    await this.fillAndCommit(this.inputTitle(), title)
  }

  async setDescription (description: string): Promise<void> {
    await this.fillAndCommit(this.inputDescription(), description)
  }

  async checkGeneral (data: NewProject): Promise<void> {
    await this.openSection('general')
    if (data.type != null) {
      await expect(this.projectType()).toContainText(data.type)
    }
    if (data.title != null) {
      await expect(this.inputTitle()).toHaveValue(data.title)
    }
    if (data.identifier != null) {
      await expect(this.inputIdentifier()).toHaveValue(data.identifier)
    }
    if (data.description != null) {
      await expect(this.inputDescription()).toHaveValue(data.description)
    }
  }

  async checkIssueDefaults (data: NewProject): Promise<void> {
    await this.openSection('issues')
    if (data.defaultAssigneeForIssues != null) {
      await expect(this.defaultAssigneeButton()).toContainText(data.defaultAssigneeForIssues)
    }
    if (data.defaultIssueStatus != null) {
      await expect(this.defaultIssueStatusButton()).toContainText(data.defaultIssueStatus)
    }
  }

  async setIssueDefaults (data: NewProject): Promise<void> {
    await this.openSection('issues')
    if (data.defaultAssigneeForIssues != null) {
      await this.defaultAssigneeButton().click()
      await this.selectMenuItem(this.page, data.defaultAssigneeForIssues)
      await expect(this.defaultAssigneeButton()).toContainText(data.defaultAssigneeForIssues)
    }
    if (data.defaultIssueStatus != null) {
      await this.defaultIssueStatusButton().click()
      await this.selectFromDropdown(this.page, data.defaultIssueStatus)
      await expect(this.defaultIssueStatusButton()).toContainText(data.defaultIssueStatus)
    }
  }

  async setPrivate (isPrivate: boolean): Promise<void> {
    await this.openSection('members')
    if ((await this.togglePrivate().isChecked()) !== isPrivate) {
      await this.togglePrivate().click()
    }
    // A rejected change shows the access error and turns the switch back
    await expect(this.accessError()).toBeHidden()
    await expect(this.togglePrivate()).toBeChecked({ checked: isPrivate })
  }

  async addMember (name: string): Promise<void> {
    await this.openSection('members')
    await this.buttonAddMember().click()
    await this.selectMenuItem(this.page, name)
    await expect(this.memberRow(name)).toBeVisible()
  }

  async setMemberRoles (name: string, roles: string[]): Promise<void> {
    const row = this.memberRow(name)
    await row.locator('[data-id="project-member-roles"]').click()
    // The role list is a ModernPopupLabels popup: its rows, not the legacy dropdown labels
    for (const role of roles) {
      await this.page.locator('div.hulyPopup-container .hulyPopup-row', { hasText: role }).click()
    }
    await this.page.keyboard.press('Escape')
  }

  async archiveProject (): Promise<void> {
    await this.openSection('archive')
    await this.buttonArchive().click()
    await this.pressYesForPopup(this.page)
  }
}
