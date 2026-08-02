import { expect, type Locator, type Page } from '@playwright/test'

export class ClassMixinsPage {
  readonly page: Page

  constructor (page: Page) {
    this.page = page
  }

  classNavItem = (name: string): Locator => this.page.getByRole('button', { name, exact: true })
  createMixinButton = (): Locator => this.page.getByRole('button', { name: 'Create Mixin' })
  mixinNameInput = (): Locator => this.page.getByPlaceholder('Name')
  createPopupButton = (): Locator => this.page.getByRole('button', { name: 'Create', exact: true })
  mixinChip = (name: string): Locator => this.page.getByRole('button', { name: `Mixin: ${name}`, exact: true })
  mixinCard = (name: string): Locator => this.page.locator('.mixinItem', { hasText: `Mixin: ${name}` })
  mixinDeleteButton = (name: string): Locator => this.mixinCard(name).locator('button.button').last()
  confirmDeleteButton = (): Locator => this.page.getByRole('button', { name: 'Ok', exact: true })

  async selectClass (name: string): Promise<void> {
    await this.classNavItem(name).click()
  }

  async clickCreateMixin (): Promise<void> {
    await this.createMixinButton().click()
  }

  async fillMixinName (name: string): Promise<void> {
    await this.mixinNameInput().fill(name)
  }

  async clickCreatePopupButton (): Promise<void> {
    await this.createPopupButton().click()
  }

  async checkMixinExists (name: string): Promise<void> {
    await expect(this.mixinChip(name)).toBeVisible()
  }

  async deleteMixin (name: string): Promise<void> {
    await this.mixinDeleteButton(name).click()
    await this.confirmDeleteButton().click()
  }
}
