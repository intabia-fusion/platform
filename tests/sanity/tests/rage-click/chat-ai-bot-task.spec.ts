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
import { IssuesPage } from '../model/tracker/issues-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { createAccountAndWorkspace, generateId, generateTestData, rageClick } from '../utils'
import { enableJsonProtocol, trackTxFrames, type TxFrame } from './tx-frames'

const DEFAULT_PROJECT = 'Default'

// Copied in-file: ai-bot-scenarios.spec.ts's openDefaultProject is module-local, and editing that
// shared spec is out of scope here.
async function openDefaultProject (page: Page): Promise<void> {
  const projectsGroup = page.locator('#navGroup-tree-projects')
  const shown = await projectsGroup
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  if (!shown) {
    await page.locator('.topmenu-container button').click()
    await expect(projectsGroup).toBeVisible({ timeout: 15000 })
  }
  await new TrackerNavigationMenuPage(page).openIssuesForProject(DEFAULT_PROJECT)
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
// after. TaskProposalPresenter's `applyToDraft()` is idempotent in its final DOM state (the same
// proposal re-derives the same fixed fields every call), so the only observable difference without
// the `applyingToDraft` guard is on the wire: how many `{applied: true}` tx frames get sent. This
// test is kept in its own file: run in the same worker right after another aibot-driven test, the
// mock assistant's reply to this specific scenario reliably never arrives (reproduced 3/3) - a
// per-workspace aibot warm-up/queueing quirk of the local mock, not of this test or the guard.
test.describe('Rage click: ai-bot task proposal', () => {
  test('rage-clicking Apply on an issue-draft proposal applies exactly once', async ({ page, request }) => {
    await enableJsonProtocol(page)
    const tx = trackTxFrames(page)

    const data = generateTestData()
    await createAccountAndWorkspace(page, request, data, 'tracker')

    const issuesPage = new IssuesPage(page)
    await openDefaultProject(page)
    await issuesPage.clickButtonCreateNewIssue()

    await page.locator('[data-id="btnIssueAssist"]').click()
    const panel = page.locator('.assist')
    await expect(panel).toBeVisible({ timeout: 30000 })

    const drafted = `Drafted by the assistant ${generateId()}`
    const input = panel.locator('div.text-editor-view')
    await expect(input).toBeVisible({ timeout: BOT_REPLY_TIMEOUT })
    await input.fill(`поправь черновик\ncall:edit_issue_draft {"title":"${drafted}"}`)
    await panel.locator('g#Send').click()

    const card = panel.locator('.activityMessage').filter({ has: page.locator('[data-id="aiTaskProposal"]') })
    await expect(card).toBeVisible({ timeout: BOT_REPLY_TIMEOUT })
    await page.mouse.move(0, 0)

    const before = tx.frames.length
    // applyingToDraft guards applier(value) + diffUpdate the same way; same race window.
    await rageClick(card.getByRole('button', { name: 'Apply', exact: true }))
    await expect(issuesPage.inputPopupCreateNewIssueTitle()).toHaveValue(drafted, { timeout: 30000 })
    await page.waitForTimeout(1000)

    expect(countApplied(tx.frames.slice(before))).toBe(1)

    // Recovered: the button flips to "Apply again" (still enabled, not stuck loading/disabled).
    await expect(card.getByRole('button', { name: 'Apply again' })).toBeEnabled({ timeout: 15000 })
  })
})
