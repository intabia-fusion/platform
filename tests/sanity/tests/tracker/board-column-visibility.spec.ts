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

import { expect, test } from '@playwright/test'
import { BoardsPage } from '../model/tracker/boards-page'

// Geometry regression: no server or authenticated workspace is needed.
test.use({ storageState: { cookies: [], origins: [] } })

for (const height of [600, 800]) {
  test(`column reveal permits vertical clipping at viewport height ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height })
    await page.setContent(`
      <style>
        .scroll { width: 500px; height: 900px; overflow: auto; }
        .box { display: flex; gap: 12px; width: max-content; }
        .column { flex: none; width: 200px; height: 900px; }
        .head { height: 32px; }
      </style>
      <div class="scroll"><div class="box">
        ${Array.from({ length: 6 }, () => '<div class="column" data-id="boardColumn"><div class="head">Title</div></div>').join('')}
      </div></div>
    `)
    const boards = new BoardsPage(page)
    const last = boards.settingsColumn().last()
    await expect(last).not.toBeInViewport()
    await page.locator('.scroll').evaluate((element) => {
      element.scrollTo({ left: element.scrollWidth, behavior: 'smooth' })
    })
    await boards.expectColumnRevealed(last)
    // The old area-based assertion rejected this correctly revealed column.
    await expect(last).not.toBeInViewport({ ratio: 1 })
  })
}
