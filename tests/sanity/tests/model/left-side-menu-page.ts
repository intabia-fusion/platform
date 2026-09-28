import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from './common-page'
import { retry } from '../retry'

export class LeftSideMenuPage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  buttonChunter = (): Locator => this.page.locator('button[id$="ApplicationLabelChunter"]')
  buttonContacts = (): Locator => this.page.locator('button[id$="Contacts"]')
  buttonTracker = (): Locator => this.page.locator('button[id$="TrackerApplication"]')
  buttonRecruiting = (): Locator => this.page.locator('[id="app-recruit\\:string\\:RecruitApplication"]')
  buttonNotification = (): Locator => this.page.locator('button[id$="app-notification:string:Inbox"]')
  buttonDocuments = (): Locator => this.page.locator('button[id$="document:string:DocumentApplication"]')
  buttonPlanner = (): Locator => this.page.locator('button[id$="app-time:string:Planner"]')
  profileButton = (): Locator => this.page.locator('#profile-button')
  inviteToWorkspaceButton = (): Locator => this.page.locator('button:has-text("Invite to workspace")')
  getInviteLinkButton = (): Locator => this.page.locator('button:has-text("Get invite link")')
  clickCloseOnInviteLinkButton = (): Locator => this.page.getByRole('button', { name: 'Close' })

  // Actions
  async openProfileMenu (): Promise<void> {
    await this.profileButton().click()
  }

  async inviteToWorkspace (): Promise<void> {
    await this.inviteToWorkspaceButton().click()
  }

  async getInviteLink (): Promise<void> {
    await this.getInviteLinkButton().click()
  }

  // The open app has no icon in the list, and it can open on its own between check and click -
  // so wait for the url to change, never for the button.
  private async openApp (button: Locator, alias: string): Promise<void> {
    const opened = (): boolean => new URL(this.page.url()).pathname.split('/')[3] === alias
    if (opened()) return
    await retry(async () => {
      if (opened()) return
      await button.click({ timeout: 5000 })
      await expect.poll(opened, { timeout: 5000 }).toBe(true)
    })
  }

  async clickChunter (): Promise<void> {
    await this.openApp(this.buttonChunter(), 'chunter')
  }

  async clickContacts (): Promise<void> {
    await this.openApp(this.buttonContacts(), 'contact')
  }

  async clickTracker (): Promise<void> {
    await this.openApp(this.buttonTracker(), 'tracker')
  }

  async clickNotification (): Promise<void> {
    await this.openApp(this.buttonNotification(), 'notification')
  }

  async clickDocuments (): Promise<void> {
    await this.openApp(this.buttonDocuments(), 'document')
  }

  async clickPlanner (): Promise<void> {
    await this.openApp(this.buttonPlanner(), 'time')
  }

  async clickRecruiting (): Promise<void> {
    await this.openApp(this.buttonRecruiting(), 'recruit')
  }

  async clickOnCloseInvite (): Promise<void> {
    await this.clickCloseOnInviteLinkButton().click()
  }
}
