import { expect, Page } from '@playwright/test'

export class CommonPage {
  async selectListItemWithSearch (page: Page, name: string): Promise<void> {
    if (name !== 'first') {
      // Person popup uses fulltext ($search) over Person.name stored as "last,first"; typing the displayed
      // "Last First" filters everything out. The list is short, so click the item directly without searching.
      const item = page.locator('div.selectPopup div.list-item', { hasText: name })
      await item.waitFor({ state: 'visible' })
      await item.click({ delay: 100 })
      return
    }
    await page.locator('div.selectPopup div.list-item', { hasText: name }).click({ delay: 100 })
  }

  async selectListItem (page: Page, name: string): Promise<void> {
    await page.locator('div.selectPopup div.list-item', { hasText: name }).click({ delay: 100 })
  }

  async pressCreateButtonSelectPopup (page: Page): Promise<void> {
    await page.locator('div.selectPopup div.header button:last-child').click()
  }

  async addNewTagPopup (page: Page, title: string, description: string): Promise<void> {
    await page.locator('div.popup form[id="tags:string:AddTag"] input[placeholder$="title"]').fill(title)
    await page
      .locator('div.popup form[id="tags:string:AddTag"] input[placeholder="Please type description here"]')
      .fill(description)
    await page.locator('div.popup form[id="tags:string:AddTag"] button[type="submit"]').click()
  }

  async selectMenuItem (page: Page, point: string): Promise<void> {
    await page.locator('div.selectPopup button.menu-item', { hasText: point }).click()
  }

  async pressYesDeletePopup (page: Page): Promise<void> {
    await page.locator('div.popup button.dangerous').click()
    await expect(page.locator('div.popup button.dangerous')).toBeHidden()
  }

  async selectFromDropdown (page: Page, point: string): Promise<void> {
    await page.locator('div[class$="opup"] span[class*="label"]', { hasText: point }).click()
  }

  async pressYesForPopup (page: Page): Promise<void> {
    await expect(page.locator('div.popup button[type="submit"]')).toBeVisible()
    await page.locator('div.popup button[type="submit"]').click()
  }
}
