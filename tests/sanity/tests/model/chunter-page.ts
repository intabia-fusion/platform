import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from './common-page'
import { SignUpData } from './common-types'
import { retry } from '../retry'

export class ChunterPage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  readonly buttonNewChat = (): Locator => this.page.locator('.hulyNavPanel-header .header-actions button').last()

  readonly inputNewChannelName = (): Locator => this.page.getByPlaceholder('New channel')
  readonly inputDescription = (): Locator => this.page.getByPlaceholder('Description (optional)')
  readonly checkboxMakePublic = (): Locator => this.page.getByRole('button', { name: 'Public' })
  readonly checkboxMakePrivate = (): Locator => this.page.getByRole('button', { name: 'Private' })
  readonly buttonCreateChannel = (): Locator => this.page.getByRole('button', { name: 'Create', exact: true })
  readonly buttonOpenChannel = (): Locator => this.page.locator('div.antiNav-element__dropbox span.an-element__label')
  readonly inputNewDirectChatEmployee = (): Locator => this.page.locator('.popup input[placeholder="Search..."]')
  readonly rowEmployeeInNewDirectChatModal = (): Locator => this.page.locator('.popup .users button.row')
  readonly buttonNewDirectChatModalNext = (): Locator => this.page.locator('.hulyModal-footer button:has-text("Next")')
  readonly buttonNewDirectChatModalCreate = (): Locator =>
    this.page.locator('.hulyModal-footer button:has-text("Create")')

  readonly directMessagesButtonInLeftMenu = (): Locator =>
    this.page.locator('.hulyNavGroup-header:has-text("Direct messages")')

  // ACTIONS

  // Through the "new" menu of the chat header, not the "+" of a section: the "+" exists only while
  // the pointer is over the section header, and the navigator re-renders under it as chats come in.
  // Retried to the open form: right after enterWorkspace re-points a warm window something closes popups
  // for a moment (cause unknown, runs 20261013-165458/172346) - the menu, its item or the form itself.
  async clickAddChannel (): Promise<void> {
    await retry(async () => {
      if (await this.inputNewChannelName().isVisible()) return
      if (!(await this.popupSpanLabel('New channel').isVisible())) await this.buttonNewChat().click({ timeout: 5000 })
      await this.popupSpanLabel('New channel').click({ timeout: 5000 })
      await expect(this.inputNewChannelName()).toBeVisible({ timeout: 3000 })
    })
  }

  async clickAddDirect (): Promise<void> {
    await this.buttonNewChat().click()
    await this.selectFromDropdown(this.page, 'New direct chat')
  }

  // A form closed under the test reads like a created channel: only the navigator row proves Create landed.
  // Whole name: `links-x` is a prefix of `links-x-target`, and the longer one already counted as created.
  async createChannel (channelName: string, privateChannel: boolean): Promise<void> {
    const created = this.page.locator('[data-testid="section-chunter:class:Channel"]').getByRole('button', {
      name: new RegExp(`(^|\\s)${channelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i')
    })
    await retry(async () => {
      if (await created.isVisible()) return
      await this.clickAddChannel()
      await this.inputNewChannelName().fill(channelName, { timeout: 5000 })
      if (privateChannel) {
        await this.checkboxMakePublic().click({ timeout: 5000 })
        await this.checkboxMakePrivate().click({ timeout: 5000 })
      }
      await this.buttonCreateChannel().click({ timeout: 5000 })
      await expect(created).toBeVisible({ timeout: 10000 })
    }, 45000)
  }

  async openChannel (channelName: string): Promise<void> {
    await this.buttonOpenChannel().filter({ hasText: channelName }).click()
  }

  getChatLocator (name: string): Locator {
    return this.page.getByRole('button', { name })
  }

  async createDirectChat ({ firstName, lastName }: SignUpData): Promise<void> {
    // Retried by the caller, and a failed attempt leaves its modal up: every later click then
    // lands on the overlay instead of the page and waits out its whole timeout.
    await this.closePopups()
    await this.clickAddDirect()
    await this.inputNewDirectChatEmployee().fill(`${lastName}`)
    await this.rowEmployeeInNewDirectChatModal()
      .filter({ hasText: `${lastName} ${firstName}` })
      .click()
    await this.buttonNewDirectChatModalNext().click()
    await this.buttonNewDirectChatModalCreate().click()
    await expect(this.directMessagesButtonInLeftMenu()).toBeVisible()
    await expect(this.page.locator('div.modal-overlay')).toHaveCount(0, { timeout: 5000 })
  }
}
