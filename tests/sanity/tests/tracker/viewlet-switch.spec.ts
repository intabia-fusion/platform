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

import { type TxOperations } from '@hcengineering/core'
import { expect, test } from '../fixtures'
import { connectTracker, createIssue, deleteIssuesByTitlePrefix, getProjectContext } from '../API/TrackerApi'
import { PlatformSetting, PlatformURI, PlatformWs, generateId } from '../utils'
import { ViewletSelectors } from './tracker.utils'

test.use({ storageState: PlatformSetting })

test.describe('Tracker viewlet switch', () => {
  let client: TxOperations
  const titlePrefix = `viewlet-switch-${generateId()}-`

  test.beforeAll(async () => {
    client = (await connectTracker()).client
    // An empty board shows a blank view, not columns.
    await createIssue(client, await getProjectContext(client), { title: `${titlePrefix}issue`, status: 'Todo' })
  })

  test.afterAll(async () => {
    if (client !== undefined) {
      await deleteIssuesByTitlePrefix(client, titlePrefix)
    }
  })

  test('board picked on the bare tracker url renders the board', async ({ page }) => {
    const trackerUrl = `${PlatformURI}/workbench/${PlatformWs}/tracker`
    const board = page.locator('[data-id="kanban-column"], [data-id="kanban-swimlane"]').first()
    const list = page.locator('.list-container')

    // Makes All issues the tracker's last special.
    await (await page.goto(`${trackerUrl}/all-issues`))?.finished()
    await page.locator(ViewletSelectors.Table).click()
    await expect(list.first()).toBeVisible()

    // The bare url restores All issues; the Board pick used to roll back to the list here.
    await (await page.goto(trackerUrl))?.finished()
    await expect(list.first()).toBeVisible()
    await page.locator(ViewletSelectors.Board).click()
    await expect(page.locator(ViewletSelectors.Board).locator('input')).toBeChecked()
    await expect(board).toBeVisible()
    await expect(list).toHaveCount(0)

    // Not the bare url again: it is now the last location and restores no special.
    await (await page.goto(`${trackerUrl}/all-issues`))?.finished()
    await expect(board).toBeVisible()
    await expect(page.locator(ViewletSelectors.Board).locator('input')).toBeChecked()
  })
})
