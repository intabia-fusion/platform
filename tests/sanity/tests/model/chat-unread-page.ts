import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from './common-page'

const badgeTimeout = 30000

/**
 * What tells the user there is something unread in the chat: application markers on the left rail,
 * counters in the chat navigator, the "New" separator and the jump-to-latest button of a channel.
 */
export class ChatUnreadPage extends CommonPage {
  constructor (readonly page: Page) {
    super(page)
  }

  readonly chatAppMarker = (): Locator => this.page.locator('button[id$="ApplicationLabelChunter"] .marker')
  readonly inboxAppMarker = (): Locator => this.page.locator('button[id$="app-notification:string:Inbox"] .marker')

  readonly navItem = (name: string): Locator => this.page.locator('.hulyNavItem-container').filter({ hasText: name })
  readonly navCounter = (name: string): Locator => this.navItem(name).locator('.notifyMarker')

  readonly section = (id: string): Locator => this.page.locator(`[data-testid="section-${id}"]`)
  readonly sectionCounter = (id: string): Locator => this.section(id).locator('.hulyNavGroup-header .notifyMarker')

  // The channel view only: a thread in the sidebar has a separator of its own.
  readonly newSeparator = (): Locator =>
    this.page.locator('.hulyComponent:not(#sidebar *) .label', { hasText: /^New$/ })

  readonly newSeparatorInSidebar = (): Locator => this.page.locator('#sidebar .label', { hasText: /^New$/ })
  readonly latestMessagesButton = (): Locator => this.page.getByRole('button', { name: 'Latest messages' })
  readonly message = (text: string): Locator => this.page.locator('.hulyComponent .activityMessage', { hasText: text })

  async checkChatAppMarker (visible: boolean): Promise<void> {
    await expect(this.chatAppMarker()).toHaveCount(visible ? 1 : 0, { timeout: badgeTimeout })
  }

  async checkInboxAppMarker (visible: boolean): Promise<void> {
    await expect(this.inboxAppMarker()).toHaveCount(visible ? 1 : 0, { timeout: badgeTimeout })
  }

  /** `count === undefined`: no counter at all. */
  async checkNavCounter (name: string, count: number | undefined, color?: 'red' | 'gray'): Promise<void> {
    if (count === undefined) {
      await expect(this.navCounter(name)).toHaveCount(0, { timeout: badgeTimeout })
      return
    }
    await expect(this.navCounter(name)).toHaveText(String(count), { timeout: badgeTimeout })
    if (color !== undefined) {
      await expect(this.navCounter(name)).toHaveClass(new RegExp(`\\b${color}\\b`), { timeout: badgeTimeout })
    }
  }

  /** The counter never shows up while `action` runs and for a moment after it. */
  async checkNavCounterStaysAway (name: string, settleMs = 1500): Promise<void> {
    const deadline = Date.now() + settleMs
    while (Date.now() < deadline) {
      expect(await this.navCounter(name).count()).toBe(0)
      await this.page.waitForTimeout(100)
    }
  }

  async collapseSection (id: string): Promise<void> {
    await this.section(id).locator('.hulyNavGroup-header__chevron').click()
    await expect(this.section(id).locator('.hulyNavGroup-header__chevron')).toHaveClass(/collapsed/)
  }

  /** `count === undefined`: no counter on the collapsed section. */
  async checkSectionCounter (id: string, count: number | undefined, timeout = badgeTimeout): Promise<void> {
    if (count === undefined) {
      await expect(this.sectionCounter(id)).toHaveCount(0, { timeout })
    } else {
      await expect(this.sectionCounter(id)).toHaveText(String(count), { timeout })
    }
  }

  async checkNewSeparator (visible: boolean): Promise<void> {
    if (visible) {
      await expect(this.newSeparator()).toBeVisible()
    } else {
      await expect(this.newSeparator()).toHaveCount(0)
    }
  }

  /** The separator sits right above `firstUnread` and below `lastRead`. */
  async checkNewSeparatorBetween (lastRead: string | undefined, firstUnread: string): Promise<void> {
    await expect(this.newSeparator()).toBeVisible()
    await expect(this.message(firstUnread)).toBeVisible()
    const separator = await this.newSeparator().boundingBox()
    const unread = await this.message(firstUnread).boundingBox()
    expect(separator).not.toBeNull()
    expect(unread).not.toBeNull()
    expect((separator?.y ?? 0) < (unread?.y ?? 0)).toBeTruthy()
    if (lastRead !== undefined) {
      const read = await this.message(lastRead).boundingBox()
      expect(read).not.toBeNull()
      expect((read?.y ?? 0) < (separator?.y ?? 0)).toBeTruthy()
    }
  }

  async checkInViewport (text: string): Promise<void> {
    await expect(this.message(text)).toBeInViewport()
  }
}
