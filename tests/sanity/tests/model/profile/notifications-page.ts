import { Page, Locator, expect } from '@playwright/test'
import { retry } from '../../retry'

export enum MenuItems {
  COMPANIES = 'Companies',
  PERSONS = 'Persons',
  CHAT = 'Chat',
  REVIEW = 'Review',
  APPLICATION = 'Application',
  VACANCY = 'Vacancy',
  TALENT = 'Talent',
  SETTING = 'Setting',
  TELEGRAM = 'Telegram',
  EMAIL = 'Email',
  NOTIFICATIONS = 'Notifications',
  ISSUES = 'Issues',
  DOCUMENTS = 'Documents',
  REQUESTS = 'Requests',
  TODOS = "Todo's"
}

export class NotificationsPage {
  private readonly page: Page

  companies = (): Locator => this.page.getByRole('button', { name: 'Companies' })
  persons = (): Locator => this.page.getByRole('button', { name: 'Persons' })
  chat = (): Locator => this.page.getByRole('button', { name: 'Chat' })
  review = (): Locator => this.page.getByRole('button', { name: 'Review' })
  application = (): Locator => this.page.getByRole('button', { name: 'Application' })
  vacancy = (): Locator => this.page.getByRole('button', { name: 'Vacancy' })
  talent = (): Locator => this.page.getByRole('button', { name: 'Talent' })
  setting = (): Locator => this.page.getByRole('button', { name: 'Setting' })
  telegram = (): Locator => this.page.getByRole('button', { name: 'Telegram' })
  email = (): Locator => this.page.getByRole('button', { name: 'Email' })
  notifications = (): Locator => this.page.getByRole('button', { name: 'Notifications' })
  issues = (): Locator => this.page.getByRole('button', { name: 'Issues' })
  documents = (): Locator => this.page.getByRole('button', { name: 'Documents' })
  requests = (): Locator => this.page.getByRole('button', { name: 'Requests' })
  todos = (): Locator => this.page.getByRole('button', { name: "Todo's" })
  chatMessageToggle = (): Locator => this.page.locator('.grid > div:nth-child(7)')

  constructor (page: Page) {
    this.page = page
  }

  async clickMenuItem (item: MenuItems): Promise<void> {
    switch (item) {
      case MenuItems.COMPANIES:
        await this.companies().click()
        break
      case MenuItems.PERSONS:
        await this.persons().click()
        break
      case MenuItems.CHAT:
        await this.chat().click()
        break
      case MenuItems.REVIEW:
        await this.review().click()
        break
      case MenuItems.APPLICATION:
        await this.application().click()
        break
      case MenuItems.VACANCY:
        await this.vacancy().click()
        break
      case MenuItems.TALENT:
        await this.talent().click()
        break
      case MenuItems.SETTING:
        await this.setting().click()
        break
      case MenuItems.TELEGRAM:
        await this.telegram().click()
        break
      case MenuItems.EMAIL:
        await this.email().click()
        break
      case MenuItems.NOTIFICATIONS:
        await this.notifications().click()
        break
      case MenuItems.ISSUES:
        await this.issues().click()
        break
      case MenuItems.DOCUMENTS:
        await this.documents().click()
        break
      case MenuItems.REQUESTS:
        await this.requests().click()
        break
      case MenuItems.TODOS:
        await this.todos().click()
        break
      default:
        throw new Error('Unknown button type')
    }
  }

  // Positional locator, so a click can land on a neighbouring toggle or on nothing at all, and the
  // test then asserts an absence it never configured. Read the state back instead of trusting it.
  async toggleChatMessage (): Promise<void> {
    const box = this.chatMessageToggle().locator('input[type="checkbox"]')
    const before = await box.isChecked()
    await retry(async () => {
      if ((await box.isChecked()) !== before) return
      await this.chatMessageToggle().click({ timeout: 5000 })
      expect(await box.isChecked()).toBe(!before)
    })
  }
}
