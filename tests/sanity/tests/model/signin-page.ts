import { expect, type Locator, type Page } from '@playwright/test'
import { CommonPage } from './common-page'
import { SignUpData } from './common-types'

export class SignInJoinPage extends CommonPage {
  readonly page: Page

  constructor (page: Page) {
    super(page)
    this.page = page
  }

  // Initial step buttons
  buttonJoinAs = (): Locator => this.page.locator('button', { hasText: 'Join as' })
  buttonCreateNewAccount = (): Locator => this.page.locator('button', { hasText: 'Create new account' })
  buttonUseCurrentAccount = (): Locator => this.page.locator('button', { hasText: 'Join with existing account' })

  // Login form fields (used after clicking "Already signed in?")
  inputEmail = (): Locator => this.page.locator('input[name="email"]')
  inputPassword = (): Locator => this.page.locator('input[name="current-password"]')
  buttonLogInAndJoin = (): Locator => this.page.locator('button', { hasText: 'Log In' })
  buttonBack = (): Locator => this.page.locator('button', { hasText: 'Back' })
  linkLoginWithPassword = (): Locator => this.page.locator('a', { hasText: 'Login with password' })

  async joinWithCurrentAccount (): Promise<void> {
    await this.buttonJoinAs().click()
  }

  async goToSignup (): Promise<void> {
    await this.buttonCreateNewAccount().click()
  }

  async goToLogin (): Promise<void> {
    await this.buttonUseCurrentAccount().click()
  }

  async switchToPasswordLogin (): Promise<void> {
    await this.linkLoginWithPassword().click()
  }

  async join (data: Pick<SignUpData, 'email' | 'password'>): Promise<void> {
    await this.goToLogin()
    await this.inputEmail().fill(data.email)
    await this.inputPassword().fill(data.password)
    expect(await this.buttonLogInAndJoin().isEnabled()).toBe(true)
    await this.buttonLogInAndJoin().click()
  }
}
