import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from '../common-page'

export class OfficePage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  // Navigation - sidebar link to Office/Love
  loveLink = (): Locator => this.page.locator('a[href$="/love"]')

  // Floor view
  floorGrid = (): Locator => this.page.locator('div.floorGrid')
  roomCell = (roomName: string): Locator => this.page.locator('div.floorGrid-room', { hasText: roomName })

  roomCellByDataId = (roomName: string): Locator => this.page.locator(`[data-id="room-${roomName}"]`)

  roomHeader = (roomName: string): Locator => this.page.locator('div.floorGrid-room__header', { hasText: roomName })

  // Room popup
  roomPopup = (): Locator => this.page.locator('div.antiPopup.room-popup')
  enterRoomButton = (): Locator => this.page.locator('[data-id="room-enter"]')

  // Actions
  async navigateToOffice (): Promise<void> {
    // Presence/love widget reactivity remounts the sidebar link; a bare `.click()` races it,
    // throwing "element was detached from the DOM" and burning the timeout via Playwright's retry.
    if (/\/love(\?|#|$|\/)/.test(this.page.url())) return
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.loveLink().click({ timeout: 5000 })
        break
      } catch (err) {
        if (/\/love(\?|#|$|\/)/.test(this.page.url())) break
        if (attempt === 4) throw err
        await this.page.waitForTimeout(250)
      }
    }
    await expect(this.page).toHaveURL(/\/love/)
  }

  async clickRoom (roomName: string): Promise<void> {
    await this.roomCell(roomName).click()
  }

  async expectRoomVisible (roomName: string): Promise<void> {
    await expect(this.roomCell(roomName)).toBeVisible()
  }
}
