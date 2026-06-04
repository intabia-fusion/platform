import { type Locator, type Page } from '@playwright/test'
import { UserSignUp } from './types'

export class SignupPage {
  readonly page: Page
  readonly inputFirstName: Locator
  readonly inputLastName: Locator
  readonly inputEmail: Locator
  readonly inputNewPassword: Locator
  readonly inputRepeatNewPassword: Locator
  readonly checkboxPersonalData: Locator
  readonly checkboxRules: Locator
  readonly buttonSignUp: Locator
  readonly textError: Locator

  constructor (page: Page) {
    this.page = page
    this.inputFirstName = page.locator('input[name="given-name"]')
    this.inputLastName = page.locator('input[name="family-name"]')
    this.inputEmail = page.locator('input[name="email"]')
    this.inputNewPassword = page.locator('input[name="password"]')
    this.inputRepeatNewPassword = page.locator('input[name="password2"]')
    this.checkboxPersonalData = page.locator('[data-testid="checkbox-personal-data"]')
    this.checkboxRules = page.locator('[data-testid="checkbox-rules"]')
    this.buttonSignUp = page.locator('button', { hasText: 'Sign Up' })
    this.textError = page.locator('div.ERROR > span')
  }

  async signupPwd (userData: UserSignUp): Promise<void> {
    await this.inputFirstName.fill(userData.firstName)
    await this.inputLastName.fill(userData.lastName)
    await this.inputEmail.fill(userData.email)
    await this.inputNewPassword.fill(userData.password)
    await this.inputRepeatNewPassword.fill(userData.password)
    await this.checkboxPersonalData.check()
    await this.checkboxRules.check()
  }
}
