import { expect, type Locator } from '@playwright/test'
import { NewMilestone } from './types'
import { CommonTrackerPage } from './common-tracker-page'

export class MilestonesPage extends CommonTrackerPage {
  modelSelectorAll = (): Locator => this.page.locator('label[data-id="tab-all"]')
  modelSelectorPlanned = (): Locator => this.page.locator('label[data-id="tab-planned"]')
  modelSelectorActive = (): Locator => this.page.locator('label[data-id="tab-active"]')
  buttonCreateNewMilestone = (): Locator => this.page.getByRole('button', { name: 'Milestone', exact: true })
  inputNewMilestoneName = (): Locator =>
    this.page.locator('form[id="tracker:string:NewMilestone"] input[placeholder="Milestone name"]')

  inputNewMilestoneDescription = (): Locator => this.page.locator('form[id="tracker:string:NewMilestone"] div.tiptap')
  buttonNewMilestoneSetStatus = (): Locator =>
    this.page.locator('form[id="tracker:string:NewMilestone"] div.antiCard-pool button[type="button"]')

  // The pool holds the start date button first and the target date one second.
  buttonNewMilestoneStartDate = (): Locator =>
    this.page.locator('form[id="tracker:string:NewMilestone"] div.antiCard-pool button.datetime-button').first()

  buttonNewMilestoneTargetDate = (): Locator =>
    this.page.locator('form[id="tracker:string:NewMilestone"] div.antiCard-pool button.datetime-button').last()

  buttonNewMilestoneCreate = (): Locator =>
    this.page.locator('form[id="tracker:string:NewMilestone"] button[type="submit"]')

  async createNewMilestone (data: NewMilestone): Promise<void> {
    await this.buttonCreateNewMilestone().click()
    await this.inputNewMilestoneName().fill(data.name)
    if (data.description != null) {
      await this.inputNewMilestoneDescription().fill(data.description)
    }
    if (data.status != null) {
      await this.buttonNewMilestoneSetStatus().click()
      await this.selectFromDropdown(this.page, data.status)
    }
    if (data.startDate != null) {
      await this.buttonNewMilestoneStartDate().click()
      await this.fillDatePopup(data.startDate.day, data.startDate.month, data.startDate.year)
    }
    if (data.targetDate != null) {
      await this.buttonNewMilestoneTargetDate().click()
      await this.fillDatePopup(data.targetDate.day, data.targetDate.month, data.targetDate.year)
    }
    if (data.targetDateInDays != null) {
      await this.buttonNewMilestoneTargetDate().click()
      await this.fillDatePopupInDays(data.targetDateInDays)
    }
    // A re-render of the form (workbench still loading) drops what was typed: check, then wait for the form to go
    await expect(this.inputNewMilestoneName()).toHaveValue(data.name)
    await this.buttonNewMilestoneCreate().click()
    await expect(this.inputNewMilestoneName()).toHaveCount(0)
  }

  async openMilestoneByName (milestoneName: string): Promise<void> {
    await this.expandCollapsedCategories()
    await this.page.locator('div.listGrid a', { hasText: milestoneName }).click()
  }

  async checkMilestoneNotExist (milestoneName: string): Promise<void> {
    // Without expanding, a folded category makes this assertion pass for the wrong reason.
    await this.expandCollapsedCategories()
    await expect(this.page.locator('div.listGrid a', { hasText: milestoneName })).toHaveCount(0)
  }
}
