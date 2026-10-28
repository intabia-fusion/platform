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

import { expect, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { BOT_REPLY_TIMEOUT } from '../API/AiBot'
import { DocumentContentPage } from '../model/documents/document-content-page'
import { DocumentsPage } from '../model/documents/documents-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { createAccountAndWorkspace, generateId, generateTestData, rageClick } from '../utils'
import { enableJsonProtocol, trackTxFrames, type TxFrame } from './tx-frames'

// Copied in-file: ai-bot-scenarios.spec.ts's openAssistant/sendToAssistant are module-local, and
// editing that shared spec is out of scope here.
async function openAssistant (page: Page): Promise<void> {
  await expect(async () => {
    await page.locator('[data-id="btnDiscussWithAI"]').click()
    await expect(page.locator('#sidebar div.text-editor-view')).toBeVisible({ timeout: 15000 })
  }).toPass({ intervals: [200, 500, 1000], timeout: 30000 })
}

async function sendToAssistant (page: Page, text: string): Promise<void> {
  const input = page.locator('#sidebar div.text-editor-view')
  await expect(input).toBeVisible({ timeout: 30000 })
  await input.fill(text)
  await page.locator('#sidebar g#Send').click()
}

async function openFreshDocumentWithAssistant (page: Page, menu: LeftSideMenuPage): Promise<void> {
  const documentsPage = new DocumentsPage(page)
  const teamspace = { title: `Teamspace-${generateId()}`, description: 'ai', autoJoin: true }
  const document = { title: `Document-${generateId()}`, space: teamspace.title }

  await menu.clickDocuments()
  await documentsPage.checkTeamspaceNotExist(teamspace.title)
  await documentsPage.createNewTeamspace(teamspace)
  await documentsPage.clickOnButtonCreateDocument()
  await documentsPage.createDocument(document)
  await documentsPage.openDocument(document.title)
  await new DocumentContentPage(page).checkDocumentTitle(document.title)

  await openAssistant(page)
}

// A `client.diffUpdate` call can arrive as a lone tx, or wrapped in one `core:class:TxApplyIf`
// carrying the real ops in `.txes` - flatten both shapes before filtering.
function flatten (frames: TxFrame[]): TxFrame[] {
  const out: TxFrame[] = []
  for (const f of frames) {
    if (f._class === 'core:class:TxApplyIf' && Array.isArray(f.txes)) {
      out.push(...(f.txes as TxFrame[]))
    } else {
      out.push(f)
    }
  }
  return out
}

function countApplied (frames: TxFrame[]): number {
  return flatten(frames).filter((f) => (f.operations as any)?.applied === true).length
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. EditProposalPresenter's `apply()` is idempotent in its final DOM/doc state (setContent is
// a full replace, diffUpdate is a no-op when nothing changed), so no UI assertion would fail
// without the `applying` guard - the only observable difference is on the wire: how many
// `{applied: true}` tx frames the client actually sends. See ./tx-frames.ts.
test.describe('Rage click: ai-bot edit proposal', () => {
  test('rage-clicking Apply on a document edit proposal applies exactly once', async ({ page, request }) => {
    await enableJsonProtocol(page)
    const tx = trackTxFrames(page)

    const data = generateTestData()
    await createAccountAndWorkspace(page, request, data, 'tracker')
    const leftSideMenuPage = new LeftSideMenuPage(page)

    await openFreshDocumentWithAssistant(page, leftSideMenuPage)
    const body = `Rewritten by the assistant ${generateId()}`
    await sendToAssistant(page, `перепиши документ\ncall:propose_new_document {"markdown":"# Plan\\n\\n${body}"}`)
    const card = page.locator('#sidebar .activityMessage').filter({ has: page.locator('[data-id="aiEditProposal"]') })
    await expect(card).toBeVisible({ timeout: BOT_REPLY_TIMEOUT })
    await page.mouse.move(0, 0)

    const before = tx.frames.length
    // applying guards the whole body (setContent + diffUpdate); without it 3 rapid clicks would
    // each read the same stale value.applied === false and each send their own {applied: true} tx.
    await rageClick(card.getByRole('button', { name: 'Apply', exact: true }))
    await expect(card.getByRole('button', { name: 'Applied' })).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1000)

    expect(countApplied(tx.frames.slice(before))).toBe(1)

    const docEditor = page.locator('div.textInput div.tiptap[contenteditable="true"]')
    await expect(docEditor).toContainText(body)

    // Recovered: the card settles on "Applied", no "Apply" control left stuck mid-click.
    await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0)
  })
})
