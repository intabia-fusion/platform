import { IssuesPage } from './issues-page'
import { type Locator, expect } from '@playwright/test'

export class PublicLinkPopup extends IssuesPage {
  textPublicLink = (): Locator => this.page.locator('form[id="guest:string:PublicLink"] div.link')
  buttonRevoke = (): Locator => this.page.locator('form[id="guest:string:PublicLink"] button', { hasText: 'Revoke' })
  buttonCopy = (): Locator => this.page.locator('form[id="guest:string:PublicLink"] button', { hasText: 'Copy' })
  buttonClose = (): Locator => this.page.locator('form[id="guest:string:PublicLink"] button', { hasText: 'Close' })
  buttonOk = (): Locator => this.page.locator('div.popup button[type="submit"]', { hasText: 'Ok' })

  async getPublicLink (): Promise<string> {
    const link = await this.textPublicLink().textContent()
    expect(link).toContain('http')
    return link ?? ''
  }

  async revokePublicLink (): Promise<void> {
    await this.buttonRevoke().click()
    await this.buttonOk().click()
    // Ok closes the confirmation only once removal is done, closing the link form too. A guest
    // opened right after still finds the link, checking once at boot - a later wait never recovers.
    await expect(this.textPublicLink()).toHaveCount(0)
  }
}
