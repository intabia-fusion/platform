import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from '../common-page'

export class MeetingMinutesPage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  // Meeting name
  meetingNameInput = (): Locator => this.page.locator('[data-id="meeting-name-input"] input')

  // Privacy toggle
  togglePrivateButton = (): Locator => this.page.locator('[data-id="meeting-toggle-private"]')

  // Meeting action buttons
  joinButton = (): Locator => this.page.getByRole('button', { name: 'Join Meeting' })
  startButton = (): Locator => this.page.getByRole('button', { name: 'Start Meeting' })
  leaveButton = (): Locator => this.page.getByRole('button', { name: 'Leave Room' })
  showVideoButton = (): Locator => this.page.getByRole('button', { name: 'Show Video' })
  openRoomButton = (): Locator => this.page.getByRole('button', { name: 'Open Room' })
  closeRoomButton = (): Locator => this.page.getByRole('button', { name: 'Close Room' })

  // Panel header
  panelHeader = (): Locator => this.page.locator('div.antiPanel-component')

  // Participants
  participantsPreview = (): Locator => this.page.locator('div.room-preview')

  // Actions
  async expectMeetingName (name: string): Promise<void> {
    await expect(this.meetingNameInput()).toHaveValue(name)
  }

  async editMeetingName (newName: string): Promise<void> {
    const input = this.meetingNameInput()
    await input.click()
    await input.fill(newName)
    await input.press('Enter')
  }

  async togglePrivate (): Promise<void> {
    await this.togglePrivateButton().click()
  }

  async expectPrivateState (isPrivate: boolean): Promise<void> {
    if (isPrivate) {
      await expect(this.openRoomButton()).toBeVisible()
    } else {
      await expect(this.closeRoomButton()).toBeVisible()
    }
  }
}
