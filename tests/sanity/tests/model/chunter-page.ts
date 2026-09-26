import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from './common-page'
import { SignUpData } from './common-types'

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
  async clickAddChannel (): Promise<void> {
    await this.buttonNewChat().click()
    await this.selectFromDropdown(this.page, 'New channel')
  }

  async clickAddDirect (): Promise<void> {
    await this.buttonNewChat().click()
    await this.selectFromDropdown(this.page, 'New direct chat')
  }

  async createChannel (channelName: string, privateChannel: boolean): Promise<void> {
    await this.inputNewChannelName().fill(channelName)
    if (privateChannel) {
      await this.checkboxMakePublic().click()
      await this.checkboxMakePrivate().click()
    }
    await this.buttonCreateChannel().click()
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
