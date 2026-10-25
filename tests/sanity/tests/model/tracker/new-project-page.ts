import { expect, type Locator } from '@playwright/test'
import { CommonTrackerPage } from './common-tracker-page'
import { NewProject } from './types'

export type NewProjectStep = 'general' | 'members' | 'issues' | 'workflow' | 'summary'
const STEPS: NewProjectStep[] = ['general', 'members', 'issues', 'workflow', 'summary']

/** Create project wizard of five steps: Back and Next on the left, Create on the right on every step. */
export class NewProjectPage extends CommonTrackerPage {
  root = (): Locator => this.page.locator('form[data-id="project-create-wizard"]')
  popupHeader = (): Locator => this.root().locator('.dialog__header', { hasText: 'Create project' })
  step = (id: NewProjectStep): Locator => this.root().locator(`[data-id="project-create-step-${id}"]`)

  inputTitle = (): Locator => this.root().locator('input#project-title')
  inputIdentifier = (): Locator => this.root().locator('input#project-identifier')
  inputDescription = (): Locator => this.root().locator('textarea#project-description')
  identifierExists = (): Locator => this.root().locator('[data-id="project-identifier-exists"]')
  buttonChooseIcon = (): Locator => this.root().locator('#project-icon')
  buttonIcons = (): Locator => this.page.locator('form[id="view:string:ChooseIcon"] div.float-left > button')
  buttonSaveIcons = (): Locator =>
    this.page.locator('form[id="view:string:ChooseIcon"] div[class*="footer"] button[type="submit"]')

  // The kit Toggle puts the id on its native switch input
  buttonMakePrivate = (): Locator => this.root().locator('input#project-private')

  buttonClose = (): Locator => this.root().locator('.dialog__tools button').last()
  buttonNext = (): Locator => this.root().locator('.dialog__footer-start').getByRole('button', { name: 'Next step' })

  buttonBack = (): Locator => this.root().locator('.dialog__footer-start').getByRole('button', { name: 'Back' })
  // Secondary before the last step, positive on it
  buttonCreateProject = (): Locator =>
    this.root().locator('.dialog__footer-actions').getByRole('button', { name: 'Create', exact: true })

  memberRow = (name: string): Locator => this.root().locator('[data-id="project-settings-member"]', { hasText: name })
  memberRoles = (row: Locator): Locator => row.locator('[data-id="project-member-roles"]')
  memberMenu = (row: Locator): Locator => row.locator('[data-id="project-member-menu"]')
  summaryHead = (): Locator => this.root().locator('[data-id="project-create-summary-general"]')
  summaryOwners = (): Locator => this.root().locator('[data-id="project-create-summary-owners"]')
  summaryMembers = (): Locator => this.root().locator('[data-id="project-create-summary-members"]')

  projectTypeButton = (): Locator => this.root().locator('button[data-id="project-type"]')
  defaultAssigneeButton = (): Locator => this.root().locator('button[data-id="project-default-assignee"]')
  defaultIssueStatusButton = (): Locator => this.root().locator('button[data-id="project-default-status"]')
  popupRow = (name: string): Locator => this.page.locator('div.hulyPopup-container .hulyPopup-row', { hasText: name })

  async selectType (type: string): Promise<void> {
    await this.projectTypeButton().click()
    await this.popupRow(type).click()
    await expect(this.projectTypeButton()).toContainText(type)
  }

  /** Goes from the current step with Next or Back; the steps passed forward must be valid. */
  async goToStep (id: NewProjectStep): Promise<void> {
    const target = STEPS.indexOf(id)
    let current = 0
    while (current < STEPS.length - 1 && !(await this.step(STEPS[current]).isVisible())) current++
    while (current !== target) {
      const forward = current < target
      await (forward ? this.buttonNext() : this.buttonBack()).click()
      current += forward ? 1 : -1
      await expect(this.step(STEPS[current])).toBeVisible()
    }
  }

  async createNewProject (data: NewProject): Promise<void> {
    await expect(this.popupHeader()).toBeVisible()

    if (data.type != null) {
      await this.selectType(data.type)
    }
    if (data.title != null) {
      await this.inputTitle().fill(data.title)
    }
    if (data.identifier != null) {
      await this.inputIdentifier().fill(data.identifier)
    }
    if (data.description != null) {
      await this.inputDescription().fill(data.description)
    }
    if (data.iconNumber != null) {
      await this.buttonChooseIcon().click()
      await this.buttonIcons().nth(data.iconNumber).click()
      await this.buttonSaveIcons().click()
    }
    if (data.private === true) {
      await this.goToStep('members')
      await this.buttonMakePrivate().click()
      await expect(this.buttonMakePrivate()).toBeChecked()
    }
    if (data.defaultAssigneeForIssues != null) {
      await this.goToStep('issues')
      await this.defaultAssigneeButton().click()
      await this.selectMenuItem(this.page, data.defaultAssigneeForIssues)
    }
    if (data.defaultIssueStatus != null) {
      await this.goToStep('issues')
      await this.defaultIssueStatusButton().click()
      await this.selectFromDropdown(this.page, data.defaultIssueStatus)
    }

    await this.buttonCreateProject().click()
    await expect(this.root()).toBeHidden()
  }
}
