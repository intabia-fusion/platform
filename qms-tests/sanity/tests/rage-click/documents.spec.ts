//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. These buttons only exist in the Controlled Documents (QMS) workspace, so the tests live in
// this suite rather than tests/sanity.

import { expect, type Locator, type Page, test } from '@playwright/test'
import { generateId, HomepageURI, PlatformSetting, PlatformURI } from '../utils'
import { CategoriesPage } from '../model/documents/categories-page'
import { CategoryDetailsPage } from '../model/documents/category-details-page'
import { prepareCategoryStep, prepareDocumentStep } from '../documents/common-documents-steps'
import { DocumentContentPage } from '../model/documents/document-content-page'
import { NavigationMenuPage } from '../model/documents/navigation-menu-page'
import { TemplatesPage } from '../model/documents/templates-page'
import { DocumentDetails, DocumentRights, DocumentStatus, NewCategory, NewDocument, NewTemplate } from '../model/types'

test.use({
  storageState: PlatformSetting
})

// qms-tests has no rageClick helper (that lives only in the separate tests/sanity package) -
// inlined here rather than editing qms-tests/sanity/tests/utils.ts.
async function rageClick (locator: Locator, count = 3): Promise<void> {
  await locator.evaluate((el, n) => {
    for (let i = 0; i < n; i++) (el as HTMLElement).click()
  }, count)
}

interface TxFrame {
  _class: string
  objectClass?: string
  operations?: Record<string, unknown>
  attributes?: Record<string, unknown>
  txes?: TxFrame[]
}

// Most of these guards protect an idempotent update: 3 calls leave the same data as 1, so the only
// proof is on the wire. The JSON protocol (a client-side localStorage switch) makes the sent tx
// frames readable; apply() sends one TxApplyIf with the real txes nested inside.
function trackTx (page: Page): TxFrame[] {
  const frames: TxFrame[] = []
  const add = (tx: TxFrame): void => {
    frames.push(tx)
    tx.txes?.forEach(add)
  }
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      if (typeof f.payload !== 'string') return
      try {
        const data = JSON.parse(f.payload)
        if (data.method === 'tx' && Array.isArray(data.params)) data.params.forEach(add)
      } catch {
        // Not a JSON tx frame (hello handshake, ping).
      }
    })
  })
  return frames
}

// Waits for the first matching tx, then holds briefly so a duplicate the guard should block can show up.
async function expectOneTx (page: Page, frames: TxFrame[], match: (tx: TxFrame) => boolean): Promise<void> {
  await expect.poll(() => frames.filter(match).length).toBeGreaterThanOrEqual(1)
  await page.waitForTimeout(500)
  expect(frames.filter(match).length).toBe(1)
}

function randomInitials (): string {
  return Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(' ')
}

test.describe('QMS. Rage click: documents', () => {
  let txFrames: TxFrame[] = []

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('client:metadata:UseBinaryProtocol', 'false')
      localStorage.setItem('client:metadata:UseProtocolCompression', 'false')
    })
    txFrames = trackTx(page)
    await (await page.goto(`${PlatformURI}/${HomepageURI}`))?.finished()
  })

  test('"Edit document" creates one new snapshot', async ({ page }) => {
    const newDocument: NewDocument = {
      template: 'HR (HR)',
      title: `RageEditDoc-${generateId()}`,
      description: `RageEditDoc description-${generateId()}`
    }
    const documentDetails: DocumentDetails = {
      type: 'HR',
      category: 'Human Resources',
      version: 'v1.0',
      status: DocumentStatus.DRAFT,
      owner: 'Appleseed John',
      author: 'Appleseed John'
    }
    await prepareDocumentStep(page, newDocument)

    const documentContentPage = new DocumentContentPage(page)
    // Edit document only appears once the doc has been reviewed (canCreateNewSnapshot requires
    // controlledState in Reviewed/Approved/Rejected) - reviewing it by its own owner is enough.
    await documentContentPage.buttonSendForReview.click()
    await documentContentPage.fillSelectReviewersForm([documentDetails.owner])
    await documentContentPage.checkDocumentStatus(DocumentStatus.IN_REVIEW)
    await documentContentPage.completeReview()
    await documentContentPage.checkDocumentStatus(DocumentStatus.REVIEWED)

    await rageClick(documentContentPage.buttonEditDocument)

    // Without the guard, a rage click creates a ControlledDocumentSnapshot per click for the same
    // edit session instead of 1.
    await expectOneTx(
      page,
      txFrames,
      (tx) => tx._class === 'core:class:TxCreateDoc' && tx.objectClass === 'documents:class:ControlledDocumentSnapshot'
    )

    // The button is usable again: the document is editable (back to Draft), not stuck mid-edit.
    await documentContentPage.checkDocumentStatus(DocumentStatus.DRAFT)
    await documentContentPage.checkCurrentRights(DocumentRights.EDITING)
  })

  test('"Delete" in the category popup removes one category', async ({ page }) => {
    const category: NewCategory = {
      title: `RageDeleteCategory-${generateId()}`,
      code: `RDC-${generateId(4)}`,
      description: `RageDeleteCategory description-${generateId()}`
    }
    await prepareCategoryStep(page, category)

    const categoriesPage = new CategoriesPage(page)
    await categoriesPage.openCategory(category.title)

    const categoryDetailsPage = new CategoryDetailsPage(page)
    await categoryDetailsPage.checkTitle(category.title)
    await categoryDetailsPage.buttonMoreActions.click()
    await categoryDetailsPage.selectFromDropdown(page, 'Delete')

    const deleteButton = page.locator('div.popup button.dangerous')
    await expect(deleteButton).toBeEnabled({ timeout: 10000 })
    await rageClick(deleteButton)

    // Without the guard, a rage click fires 2 overlapping client.remove() calls on the same
    // category doc - the second one errors "not found" instead of the popup closing cleanly once.
    await expect(deleteButton).toBeHidden({ timeout: 10000 })
    await categoriesPage.checkCategoryNotExist(category.title)
  })

  test('"Change" in the Change Code popup updates the code once', async ({ page }) => {
    const document: NewDocument = {
      template: 'HR (HR)',
      title: `RageChangeCode-${generateId()}`,
      description: `RageChangeCode description-${generateId()}`
    }
    await prepareDocumentStep(page, document)

    const documentContentPage = new DocumentContentPage(page)
    // The info panel is already open on a new document - clicking its tab button would close it.
    // The ID field is only editable on the document's very first draft revision
    // (isInitialEditableDraft), which is exactly the state prepareDocumentStep leaves it in.
    await documentContentPage.textId.click()

    const newCode = `RCC-${generateId(4)}`
    await page.locator('div.popup input, form input').first().fill(newCode)
    const changeButton = page.locator('div.popup button, form button').filter({ hasText: 'Change' })
    await expect(changeButton).toBeEnabled({ timeout: 10000 })
    await rageClick(changeButton)

    // Without the guard, a rage click fires one client.update() per click with the same code.
    await expect(documentContentPage.textId).toHaveText(newCode, { timeout: 10000 })
    await expectOneTx(page, txFrames, (tx) => tx._class === 'core:class:TxUpdateDoc' && tx.operations?.code === newCode)
  })

  test('"Change" in the Change Prefix popup updates the prefix once', async ({ page }) => {
    const template: NewTemplate = {
      // The wizard builds the prefix from the title's word initials, and a prefix in use blocks
      // creation: random one-letter words keep it unique across runs on one stand.
      title: `RageChangePrefix ${randomInitials()} ${generateId(6)}`,
      description: `RageChangePrefix description-${generateId()}`
    }
    const navigationMenuPage = new NavigationMenuPage(page)
    await navigationMenuPage.buttonTemplates.click()

    const templatesPage = new TemplatesPage(page)
    await templatesPage.buttonCreateTemplate.click()
    await templatesPage.createTemplate(template)

    const documentContentPage = new DocumentContentPage(page)
    await documentContentPage.checkDocumentTitle(template.title)

    // Same first-draft-only editability as the document code field, for templates' prefix.
    const prefixField = page.locator('div.flex:has(div.label:text("Documents prefix")) a')
    await prefixField.click()

    const newPrefix = `RCP-${generateId(4)}`
    await page.locator('div.popup input, form input').first().fill(newPrefix)
    const changeButton = page.locator('div.popup button, form button').filter({ hasText: 'Change' })
    await expect(changeButton).toBeEnabled({ timeout: 10000 })
    await rageClick(changeButton)

    // Without the guard, a rage click fires one updateMixin() per click with the same prefix.
    await expect(prefixField).toHaveText(newPrefix, { timeout: 10000 })
    await expectOneTx(
      page,
      txFrames,
      (tx) => tx._class === 'core:class:TxMixin' && tx.attributes?.docPrefix === newPrefix
    )
  })

  test('"Change" in the Change Owner popup changes the owner once', async ({ page }) => {
    const document: NewDocument = {
      template: 'HR (HR)',
      title: `RageChangeOwner-${generateId()}`,
      description: `RageChangeOwner description-${generateId()}`
    }
    await prepareDocumentStep(page, document)

    const documentContentPage = new DocumentContentPage(page)
    await documentContentPage.executeMoreActions('Change document author')
    await documentContentPage.buttonSelectNewAuthor.click()
    await documentContentPage.selectListItemWithSearch(page, 'Dirak Kainin')

    const changeButton = page.locator('div.popup button, form button').filter({ hasText: 'Change' })
    await expect(changeButton).toBeEnabled({ timeout: 10000 })
    await rageClick(changeButton)

    // Without the guard, a rage click fires one client.update() per click setting the same owner.
    await expect(documentContentPage.textAuthor).toHaveText('Dirak Kainin', { timeout: 10000 })
    await expectOneTx(
      page,
      txFrames,
      (tx) => tx._class === 'core:class:TxUpdateDoc' && tx.operations?.owner !== undefined
    )
  })
})
