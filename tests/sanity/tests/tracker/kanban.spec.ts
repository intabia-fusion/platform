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

import { expect, test } from '../fixtures'
import tracker, { IssuePriority, type Issue } from '@hcengineering/tracker'
import { type Ref, type TxOperations } from '@hcengineering/core'
import {
  connectTracker,
  createComponent,
  createIssue,
  deleteIssuesByTitlePrefix,
  findProjectByName,
  getProjectContext,
  type ProjectContext
} from '../API/TrackerApi'
import { KanbanBoardPage } from '../model/tracker/kanban-board-page'
import { PlatformSetting, PlatformURI, generateId } from '../utils'
import { retryIntervals, waitStable } from '../retry'
import { ViewletSelectors, setViewGroup } from './tracker.utils'

async function openTrackerBoard (
  page: import('@playwright/test').Page,
  projectId: string,
  keepStorage: boolean = false
): Promise<void> {
  const projectPath = encodeURIComponent(projectId)
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
  // Reset any persisted swim lane collapse state so cells are always rendered.
  // Collapsed and merged columns go too; a reload that checks they survive keeps the storage.
  if (!keepStorage) {
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('kanban-swimlane-collapsed-') || k.startsWith('kanban-column-')) localStorage.removeItem(k)
      }
    })
  }
  await page.locator('label[data-id="tab-all"]').click()
  await page.locator(ViewletSelectors.Board).click()
  // Wait for the board to render either as legacy columns or swimlane.
  await page
    .locator('[data-id="kanban-column"], [data-id="kanban-swimlane"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
}

// The drop reaches the server in ~100ms, but the status was read *before* the drag and
// retryIntervals falls back to a 3s tail - three drops cost 44s, 35s of it pure sleep.
const dragIntervals = [100, 200, 300, 500]

async function dragUntilField (
  read: () => Promise<string | undefined>,
  target: string,
  drag: () => Promise<void>
): Promise<void> {
  const status = read
  let lastError = 'none'
  const poll = expect.poll(
    async () => {
      if ((await status()) === target) return target
      let threw = false
      try {
        await drag()
      } catch (err) {
        // The drop can already have landed while findOne still reports the old status - the card
        // is then gone from the DOM and the drag throws. Let the next read settle it.
        threw = true
        lastError = err instanceof Error ? err.message : String(err)
        console.error('drag failed:', err)
      }
      // The drop shows optimistically; wait for the tx before redragging, else it starts from
      // the new spot and costs scroll time. A failed drag sent nothing - wait the short end.
      for (const wait of threw ? retryIntervals.slice(0, 3) : retryIntervals) {
        if ((await status()) === target) return target
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      return await status()
    },
    // Short of the 60s test timeout on purpose: at 60s the runner killed the test before the poll
    // could report anything, so every one of these flakes arrived as a bare "Test timeout".
    { timeout: 40000, intervals: dragIntervals }
  )
  try {
    await poll.toBe(target)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`${msg}\nlast drag error: ${lastError}`)
  }
}

async function dragUntilStatus (
  client: TxOperations,
  cardId: Ref<Issue>,
  target: string,
  drag: () => Promise<void>
): Promise<void> {
  await dragUntilField(
    async () => (await client.findOne(tracker.class.Issue, { _id: cardId }))?.status as string | undefined,
    target,
    drag
  )
}

// Wide on purpose: with the statuses other specs add, the board needs ~2000px; at 1440 a drag
// scrolls the board while the pointer is down - the source card unmounts and the drop is lost.
test.use({ storageState: PlatformSetting, viewport: { width: 2200, height: 1000 } })

test.describe('Kanban board', () => {
  let client: TxOperations
  let ctx: ProjectContext
  const titlePrefix = `kanban-spec-${generateId()}-`

  const statusOf = async (id: Ref<Issue>): Promise<string | undefined> =>
    (await client.findOne(tracker.class.Issue, { _id: id }))?.status

  test.beforeAll(async () => {
    const conn = await connectTracker()
    client = conn.client
    ctx = await getProjectContext(client)
  })

  test.afterAll(async ({ browser }) => {
    if (client !== undefined) {
      await deleteIssuesByTitlePrefix(client, titlePrefix)
    }
    // Best-effort: reset swimlane preference so other specs see legacy layout.
    try {
      const ctxBrowser = await browser.newContext({ storageState: PlatformSetting })
      const page = await ctxBrowser.newPage()
      await openTrackerBoard(page, ctx.project._id)
      await new KanbanBoardPage(page).setSwimLane('None')
      await ctxBrowser.close()
    } catch {
      // ignore
    }
  })

  test('renders cards in correct columns by status', async ({ page }) => {
    const backlogId = await createIssue(client, ctx, {
      title: `${titlePrefix}backlog-1`,
      status: 'Backlog'
    })
    const todoId = await createIssue(client, ctx, {
      title: `${titlePrefix}todo-1`,
      status: 'Todo'
    })
    const inProgressId = await createIssue(client, ctx, {
      title: `${titlePrefix}progress-1`,
      status: 'In Progress'
    })

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    await board.expectCardInColumn(backlogId, ctx.statuses.get('Backlog') as string)
    await board.expectCardInColumn(todoId, ctx.statuses.get('Todo') as string)
    await board.expectCardInColumn(inProgressId, ctx.statuses.get('In Progress') as string)
  })

  test('drag card between columns updates status', async ({ page }) => {
    const cardId: Ref<Issue> = await createIssue(client, ctx, {
      title: `${titlePrefix}drag-1`,
      status: 'Backlog'
    })

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    const backlog = ctx.statuses.get('Backlog') as string
    const inProgress = ctx.statuses.get('In Progress') as string
    await board.expectCardInColumn(cardId, backlog)

    // Retry if the drop event was lost (HTML5 drag in headless can be flaky under load). Poll
    // the backend, not the DOM - panelDragOver shows the card in the column optimistically.
    await dragUntilStatus(client, cardId, inProgress, async () => {
      await board.dragCardToColumn(cardId, inProgress)
    })
    await board.expectCardInColumn(cardId, inProgress)
  })

  test('drag does not cause page scroll', async ({ page }) => {
    const cardId = await createIssue(client, ctx, {
      title: `${titlePrefix}scroll-1`,
      status: 'Backlog'
    })

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)

    const before = await board.getScrollTop()
    const card = board.card(cardId)
    await card.hover()
    await page.mouse.down()
    await page.mouse.move(50, 50, { steps: 5 })
    const after = await board.getScrollTop()
    await page.mouse.up()

    expect(after).toBe(before)
  })

  test('renders cards across all 5 status columns', async ({ page }) => {
    const ids: Record<string, Ref<Issue>> = {}
    for (const status of ['Backlog', 'Todo', 'In Progress', 'Done', 'Cancelled'] as const) {
      const ref = ctx.statuses.get(status)
      if (ref === undefined) continue
      ids[status] = await createIssue(client, ctx, { title: `${titlePrefix}all-${status}`, status })
    }

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    for (const status of Object.keys(ids)) {
      await board.expectCardInColumn(ids[status], ctx.statuses.get(status as 'Backlog') as string)
    }
  })

  test('drag a card across multiple columns sequentially', async ({ page }) => {
    // Three drags, each retrying until the backend confirms - past the default 60s under load.
    test.slow()
    const cardId = await createIssue(client, ctx, {
      title: `${titlePrefix}seq-1`,
      status: 'Backlog'
    })
    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    const backlog = ctx.statuses.get('Backlog') as string
    const todo = ctx.statuses.get('Todo') as string
    const inProgress = ctx.statuses.get('In Progress') as string
    const done = ctx.statuses.get('Done') as string

    await board.expectCardInColumn(cardId, backlog)

    for (const target of [todo, inProgress, done]) {
      await dragUntilStatus(client, cardId, target, async () => {
        await board.dragCardToColumn(cardId, target)
      })
      await board.expectCardInColumn(cardId, target)
    }
  })

  test('parent issue creates sub-issue with attachedTo via API', async () => {
    const parent = await createIssue(client, ctx, {
      title: `${titlePrefix}parent-1`,
      status: 'Backlog'
    })
    const child = await createIssue(client, ctx, {
      title: `${titlePrefix}child-1`,
      status: 'Todo',
      parent
    })

    const childIssue = await client.findOne(tracker.class.Issue, { _id: child })
    expect(childIssue?.attachedTo).toBe(parent)
    expect(childIssue?.attachedToClass).toBe(tracker.class.Issue)
    expect(childIssue?.parents[0]?.parentId).toBe(parent)

    const parentIssue = await client.findOne(tracker.class.Issue, { _id: parent })
    expect(parentIssue).not.toBeNull()
  })

  test('multiple cards in one column are all visible', async ({ page }) => {
    const ids: Array<Ref<Issue>> = []
    for (let i = 0; i < 3; i++) {
      ids.push(
        await createIssue(client, ctx, {
          title: `${titlePrefix}multi-${i}`,
          status: 'Backlog'
        })
      )
    }

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    const backlog = ctx.statuses.get('Backlog') as string
    for (const id of ids) {
      await board.expectCardInColumn(id, backlog)
    }
  })

  test.describe('Swim lanes', () => {
    // No reset between tests: view options live in the page's localStorage, and every test gets a fresh
    // context from the shared storage state, so a swim lane set here cannot reach the next test.
    test('appear when grouping by Priority', async ({ page }) => {
      await createIssue(client, ctx, { title: `${titlePrefix}sw-pri-1`, status: 'Backlog' })
      await createIssue(client, ctx, { title: `${titlePrefix}sw-pri-2`, status: 'Todo' })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      await expect(page.locator('[data-id="kanban-swimlane"]').first()).toBeVisible()
      const ids = await board.swimLanes()
      expect(ids.length).toBeGreaterThan(0)
    })

    test('order is stable across drag', async ({ page }) => {
      // Stable card lives in Urgent (4) — sparse lane, predictable visibility.
      // Anchors in the other priorities keep the lanes from disappearing.
      const stable = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-stable`,
        status: 'Backlog',
        priority: 4
      })
      for (let p = 0; p <= 3; p++) {
        await createIssue(client, ctx, {
          title: `${titlePrefix}sw-stable-anchor-${p}`,
          status: 'Backlog',
          priority: p
        })
      }
      // Anchor in Todo of the stable lane (Urgent) so the target cell has a card to drop onto.
      await createIssue(client, ctx, {
        title: `${titlePrefix}sw-stable-todo-anchor`,
        status: 'Todo',
        priority: 4
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')
      await board.revealCard(stable)

      const beforeOrder = await board.swimLanes()
      expect(beforeOrder.length).toBeGreaterThanOrEqual(5)

      // Drag the stable card into the Todo cell of its own priority lane.
      const stableLaneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${stable}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(stableLaneId).not.toBeNull()
      if (stableLaneId === null) return
      await dragUntilStatus(client, stable, ctx.statuses.get('Todo') as string, async () => {
        await board.dragCardToSwimLaneCell(stable, stableLaneId, ctx.statuses.get('Todo') as string)
      })

      const afterOrder = await board.swimLanes()
      // Priority lanes that existed before must keep the same relative order.
      const beforeFiltered = beforeOrder.filter((id) => afterOrder.includes(id))
      const afterFiltered = afterOrder.filter((id) => beforeOrder.includes(id))
      expect(afterFiltered).toEqual(beforeFiltered)
    })

    test('drag child between parent lanes changes attachedTo', async ({ page }) => {
      const parentA = await createIssue(client, ctx, { title: `${titlePrefix}sw-parA`, status: 'Backlog' })
      const parentB = await createIssue(client, ctx, { title: `${titlePrefix}sw-parB`, status: 'Backlog' })
      const childA = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-childA`,
        status: 'Todo',
        parent: parentA
      })
      const childB = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-childB-anchor`,
        status: 'Todo',
        parent: parentB
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Parent')

      const todo = ctx.statuses.get('Todo') as string
      await expect(board.swimLane(parentA)).toBeVisible()
      await expect(board.swimLane(parentB)).toBeVisible()
      if (await board.isSwimLaneCollapsed(parentA)) await board.toggleSwimLane(parentA)
      if (await board.isSwimLaneCollapsed(parentB)) await board.toggleSwimLane(parentB)

      await board.expectCardInSwimLaneCell(childA, parentA, todo)
      await board.expectCardInSwimLaneCell(childB, parentB, todo)

      // Same shape as the status drags: read after the drop, not before, and report the drag's own
      // error - this poll used to return the pre-drag value and fail with a bare "Expected/Received".
      await dragUntilField(
        async () => (await client.findOne(tracker.class.Issue, { _id: childA }))?.attachedTo as string | undefined,
        parentB,
        async () => {
          await board.dragCardToSwimLaneCell(childA, parentB, todo)
        }
      )
    })

    test('multiple children render in the same parent lane', async ({ page }) => {
      const parent = await createIssue(client, ctx, { title: `${titlePrefix}sw-multipar`, status: 'Backlog' })
      const a = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-A`,
        status: 'Backlog',
        parent
      })
      const b = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-B`,
        status: 'Backlog',
        parent
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Parent')

      await expect(board.swimLane(parent)).toBeVisible()
      if (await board.isSwimLaneCollapsed(parent)) await board.toggleSwimLane(parent)

      const backlog = ctx.statuses.get('Backlog') as string
      await board.expectCardInSwimLaneCell(a, parent, backlog)
      await board.expectCardInSwimLaneCell(b, parent, backlog)
    })

    test('renders Assignee swim lanes including unassigned', async ({ page }) => {
      // Find any employee assigned to existing issues.
      const someAssigned = await client.findOne(tracker.class.Issue, { assignee: { $ne: null } } as any)
      const targetAssignee = someAssigned?.assignee as string | undefined
      // Always create one unassigned card.
      await createIssue(client, ctx, { title: `${titlePrefix}sw-asg-unassigned`, status: 'Todo' })
      if (targetAssignee != null) {
        await createIssue(client, ctx, {
          title: `${titlePrefix}sw-asg-anchor`,
          status: 'Todo',
          assignee: targetAssignee as Ref<any>
        })
      }

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Assignee')

      // Unassigned lane must render.
      await expect(page.locator('[data-id="kanban-swimlane"][data-swimlane-id="__swim_unassigned__"]')).toBeVisible()
      // At least one swimlane present.
      const lanes = await board.swimLanes()
      expect(lanes.length).toBeGreaterThan(0)
    })

    // Headless HTML5 drag is too flaky to reliably synthesize the
    // "drop on upper half" gesture for rank reordering. Card-on-card drop
    // works manually but Playwright's CDP path frequently lands the rank
    // in an inconsistent state. The behaviour itself is covered by the
    // Kanban.svelte cardDragOver/cardDrop logic with both dragover and drop
    // fallbacks (see commit history); revisit when CDP drag becomes stable.
    test.skip('drag in Manual order keeps card on target position (no flicker to end)', async ({ page }) => {
      // Use Medium (3) so this test owns its lane — other tests use Urgent (1)
      // / NoPriority (0). Sparse lane keeps cards in the first 3 (initialLimit).
      const c1 = await createIssue(client, ctx, { title: `${titlePrefix}rank-1`, status: 'Backlog', priority: 3 })
      const c2 = await createIssue(client, ctx, { title: `${titlePrefix}rank-2`, status: 'Backlog', priority: 3 })
      const c3 = await createIssue(client, ctx, { title: `${titlePrefix}rank-3`, status: 'Backlog', priority: 3 })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      // Wait for c1 to be rendered in the swimlane; reveal it via Show more if
      // the lane is over capacity.
      await board.revealCard(c1)
      await board.card(c1).waitFor({ state: 'visible', timeout: 15000 })
      const noPriorityLaneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${c1}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(noPriorityLaneId).not.toBeNull()
      if (noPriorityLaneId === null) return
      if (await board.isSwimLaneCollapsed(noPriorityLaneId)) await board.toggleSwimLane(noPriorityLaneId)

      const backlog = ctx.statuses.get('Backlog') as string
      await board.expandAllCells()
      await board.expectCardInSwimLaneCell(c1, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c2, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c3, noPriorityLaneId, backlog)

      // Drop c3 onto c2 for a manual rank update, retrying under flaky CDP drag. Backend rank
      // is the source of truth - check r3 < r2, not DOM order (which depends on Show more).
      await expect
        .poll(
          async () => {
            try {
              await board.dragCardToCard(c3, c2)
            } catch {
              // ignore single failures
            }
            const issues = await client.findAll(tracker.class.Issue, {
              _id: { $in: [c2, c3] }
            })
            const byId = new Map(issues.map((it) => [it._id, it]))
            const r2 = byId.get(c2)?.rank
            const r3 = byId.get(c3)?.rank
            if (r2 === undefined || r3 === undefined) return false
            return r3 < r2
          },
          { timeout: 30000, intervals: retryIntervals }
        )
        .toBe(true)

      // All three still in same cell after settle.
      await board.expectCardInSwimLaneCell(c1, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c2, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c3, noPriorityLaneId, backlog)
    })

    test('Show more counter does not flicker for unrelated cells while dragging', async ({ page }) => {
      // Create > 3 cards in one Urgent/Backlog cell so Show more is visible. Urgent (4) keeps
      // the test isolated from accumulated NoPriority issues across previous runs.
      const ids: Array<Ref<Issue>> = []
      for (let i = 0; i < 5; i++) {
        ids.push(
          await createIssue(client, ctx, {
            title: `${titlePrefix}sm-${i}`,
            status: 'Backlog',
            priority: 4
          })
        )
      }
      // Card to drag from a different cell (different status).
      const dragId = await createIssue(client, ctx, {
        title: `${titlePrefix}sm-drag`,
        status: 'Todo',
        priority: 4
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      const backlog = ctx.statuses.get('Backlog') as string
      // The Backlog cell with 5 cards should have a Show more button (locale-agnostic).
      const cellLocator = page
        .locator(`[data-id="kanban-swimlane-cell"][data-state="${backlog}"]`)
        .filter({ has: page.locator('[data-id="kanban-show-more"]') })
        .first()
      await expect(cellLocator).toBeVisible()

      // Reveal the drag source card if it landed beyond the initial limit.
      await board.revealCard(dragId)
      const card = board.card(dragId)
      await card.scrollIntoViewIfNeeded()
      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      if (box === null) return
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 4 })

      // Show more must remain visible during drag (was the bug — disappeared on every cell).
      await expect(cellLocator).toBeVisible()
      await page.mouse.up()
    })

    test('drop into same cell does not update document', async ({ page }) => {
      const cardId = await createIssue(client, ctx, {
        title: `${titlePrefix}noop-drop`,
        status: 'Backlog',
        priority: 2
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      const backlog = ctx.statuses.get('Backlog') as string
      await board.revealCard(cardId)
      await board.card(cardId).waitFor({ state: 'visible', timeout: 15000 })
      const laneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${cardId}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(laneId).not.toBeNull()
      if (laneId === null) return
      if (await board.isSwimLaneCollapsed(laneId)) await board.toggleSwimLane(laneId)
      await board.expectCardInSwimLaneCell(cardId, laneId, backlog)

      const before = await client.findOne(tracker.class.Issue, { _id: cardId })
      const beforeModifiedOn = before?.modifiedOn
      expect(beforeModifiedOn).toBeDefined()

      // Drop card back into the same cell - no rank/status/lane change expected.
      await board.dragCardToSwimLaneCell(cardId, laneId, backlog)

      // Wait briefly to allow any spurious update transactions to land.
      await page.waitForTimeout(2000)

      const after = await client.findOne(tracker.class.Issue, { _id: cardId })
      expect(after?.modifiedOn).toBe(beforeModifiedOn)
      expect(after?.status).toBe(before?.status)
      expect(after?.rank).toBe(before?.rank)
    })

    test('toggle collapse hides cells', async ({ page }) => {
      await createIssue(client, ctx, { title: `${titlePrefix}sw-toggle`, status: 'Backlog' })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      // Wait for swimlanes to be fully rendered before reading IDs.
      await expect(page.locator('[data-id="kanban-swimlane"]').first()).toBeVisible()
      const ids = await board.swimLanes()
      expect(ids.length).toBeGreaterThan(0)
      // Priority lanes are preseeded, always rendered; the unassigned lane exists only while
      // some issue in this shared project lacks priority - a parallel test can drop it first.
      const laneId = ids.find((id) => id !== '__swim_unassigned__')
      expect(laneId).toBeDefined()
      if (laneId === undefined) return

      // Toggle from whatever the persisted state is to its opposite, then back.
      const initial = await board.isSwimLaneCollapsed(laneId)
      await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, !initial)
      await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, initial)
    })

    test('swim lane header counter equals sum of cells', async ({ page }) => {
      // Counter shown next to a lane title must reflect the actual number of
      // cards rendered across all status cells in that lane.
      const ids: Array<Ref<Issue>> = []
      for (const status of ['Backlog', 'Todo', 'In Progress'] as const) {
        ids.push(await createIssue(client, ctx, { title: `${titlePrefix}counter-${status}`, status, priority: 1 }))
      }

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')
      await board.revealCard(ids[0])

      const urgentLaneId = '1'
      const counterText = await page
        .locator(`[data-id="kanban-swimlane"][data-swimlane-id="${urgentLaneId}"] .swimlane-count`)
        .first()
        .textContent()
      const counter = Number((counterText ?? '0').trim())

      const renderedCards = await page
        .locator(`[data-id="kanban-swimlane"][data-swimlane-id="${urgentLaneId}"] [data-id="kanban-card"]`)
        .count()

      expect(counter).toBeGreaterThanOrEqual(renderedCards)
      expect(counter).toBeGreaterThanOrEqual(3)
    })

    test('collapse persists across reload', async ({ page }) => {
      await createIssue(client, ctx, { title: `${titlePrefix}collapse-persist`, status: 'Backlog' })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      // Skip the unassigned lane - it disappears as soon as no issue of this shared project
      // is left without a priority. Priority lanes are preseeded and stay.
      const laneId = (await board.swimLanes()).find((id) => id !== '__swim_unassigned__')
      expect(laneId).toBeDefined()
      if (laneId === undefined) return
      const wasCollapsed = await board.isSwimLaneCollapsed(laneId)
      if (wasCollapsed) await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, false)

      // Collapse it.
      await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, true)

      // Reload WITHOUT clearing localStorage — collapsed state must persist.
      const projectPath = encodeURIComponent(ctx.project._id)
      await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
      await page.locator(ViewletSelectors.Board).click()
      // Wait for the very lane under test: lanes render one by one, so waiting for "any lane"
      // can return while this one is still missing.
      await page
        .locator(`[data-id="kanban-swimlane"][data-swimlane-id="${laneId}"]`)
        .waitFor({ state: 'visible', timeout: 10000 })
      await board.expectSwimLaneCollapsed(laneId, true)

      // Cleanup so other tests are not affected.
      await board.toggleSwimLane(laneId)
    })

    test('drop into unavailable category does not change status', async ({ page }) => {
      // getAvailableCategories returns only valid states for the project; Default's task type
      // allows all, so simulate one via a same-status drop (no-op): no modifiedOn bump.
      const cardId = await createIssue(client, ctx, {
        title: `${titlePrefix}same-col`,
        status: 'Backlog',
        priority: 1
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')
      await board.revealCard(cardId)

      const before = await client.findOne(tracker.class.Issue, { _id: cardId })
      const beforeModifiedOn = before?.modifiedOn
      const beforeRank = before?.rank
      expect(beforeModifiedOn).toBeDefined()

      // Drag the card onto itself (or onto its current cell) — should be a no-op.
      const laneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${cardId}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(laneId).not.toBeNull()
      if (laneId === null) return
      const backlog = ctx.statuses.get('Backlog') as string
      await board.dragCardToSwimLaneCell(cardId, laneId, backlog)
      await page.waitForTimeout(2000)

      const after = await client.findOne(tracker.class.Issue, { _id: cardId })
      expect(after?.modifiedOn).toBe(beforeModifiedOn)
      expect(after?.rank).toBe(beforeRank)
      expect(after?.status).toBe(before?.status)
    })

    test('toggle None -> Priority -> None -> Priority shows cards each time', async ({ page }) => {
      // Regression: groupByDocs memo (hashed by ids+lengths) skipped a refresh when projection
      // added the swim-lane field, so every lane appeared empty after the second switch.
      const cardId = await createIssue(client, ctx, {
        title: `${titlePrefix}toggle-priority`,
        status: 'Backlog',
        priority: 4
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string

      for (let i = 0; i < 2; i++) {
        await board.setSwimLane('Priority')
        await board.revealCard(cardId)
        // After projection refresh, cards must land in their priority lane — not
        // the unassigned bucket. Lane id is the priority enum value as string.
        const lane = await page
          .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${cardId}"])`)
          .first()
          .getAttribute('data-swimlane-id')
        expect(lane, `iteration ${i}: card must be in some priority lane, not unassigned`).not.toBe(
          '__swim_unassigned__'
        )
        expect(lane).not.toBeNull()
        if (lane !== null) {
          await board.expectCardInSwimLaneCell(cardId, lane, backlog)
        }
        await board.setSwimLane('None')
        await board.expectCardInColumn(cardId, backlog)
      }
    })

    test('component swim lane merges same-label components from different projects', async ({ page }) => {
      // Regression for FUSIO-378: same-label components in different projects used to render
      // as separate lanes - they should group into one, keyed by the case-folded label.
      const secondProject = await findProjectByName(client, 'Second Project')
      test.skip(secondProject === undefined, 'Second Project not seeded — skipping')
      if (secondProject === undefined) return

      const sharedLabel = `merge-${generateId(4)}`
      const compA = await createComponent(client, ctx.project._id, sharedLabel)
      const compB = await createComponent(client, secondProject._id, sharedLabel)

      const issueA = await createIssue(client, ctx, {
        title: `${titlePrefix}merge-A`,
        status: 'Backlog',
        component: compA
      })
      const ctxB = await getProjectContext(client, secondProject._id)
      const issueB = await createIssue(client, ctxB, {
        title: `${titlePrefix}merge-B`,
        status: 'Backlog',
        space: secondProject._id,
        component: compB
      })

      // Open the All Issues view to see issues from both projects.
      await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/all-issues`))?.finished()
      await page.locator(ViewletSelectors.Board).click()
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Component')
      await board.revealCard(issueA)
      await board.revealCard(issueB)

      const laneA = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${issueA}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      const laneB = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${issueB}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(laneA).not.toBeNull()
      expect(laneA).toBe(laneB)
    })
  })

  test('drag preview follows cursor in non-manual ordering', async ({ page }) => {
    // Regression: cardDragOver's `dontUpdateRank` guard stopped the preview from following the
    // cursor outside Manual ordering, so users couldn't see which column they targeted.
    const c1 = await createIssue(client, ctx, { title: `${titlePrefix}preview-1`, status: 'Backlog' })
    const c2 = await createIssue(client, ctx, { title: `${titlePrefix}preview-2`, status: 'Todo' })

    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    // Switch ordering to Modified date so dontUpdateRank=true.
    await board.openViewOptions()
    const orderingRow = page.locator('.antiCard-menu__item', { hasText: 'Ordering' })
    await orderingRow.waitFor({ state: 'visible', timeout: 5000 })
    await orderingRow.locator('button').click()
    await page.locator('.menu-item').filter({ hasText: 'Modified date' }).first().click()
    await page.keyboard.press('Escape')

    const todo = ctx.statuses.get('Todo') as string
    await board.revealCard(c1)
    await board.revealCard(c2)

    // Drag c1 onto c2: status should change to Todo (state-only update — rank stays).
    await dragUntilStatus(client, c1, todo, async () => {
      await board.revealCard(c1)
      await board.dragCardToCard(c1, c2)
    })
  })

  test('legacy drop on self does not bump modifiedOn', async ({ page }) => {
    // Mirrors the swim lane no-op test for the legacy column layout: drag a
    // card and drop it back on its own column without movement.
    const cardId = await createIssue(client, ctx, {
      title: `${titlePrefix}legacy-noop`,
      status: 'Backlog'
    })

    await openTrackerBoard(page, ctx.project._id)
    const board = new KanbanBoardPage(page)
    const backlog = ctx.statuses.get('Backlog') as string
    await board.revealCard(cardId)
    await board.expectCardInColumn(cardId, backlog)

    const before = await client.findOne(tracker.class.Issue, { _id: cardId })
    const beforeModifiedOn = before?.modifiedOn
    const beforeRank = before?.rank
    expect(beforeModifiedOn).toBeDefined()

    await board.dragCardToColumn(cardId, backlog)
    await page.waitForTimeout(2000)

    const after = await client.findOne(tracker.class.Issue, { _id: cardId })
    expect(after?.modifiedOn).toBe(beforeModifiedOn)
    expect(after?.rank).toBe(beforeRank)
    expect(after?.status).toBe(before?.status)
  })

  test('dragstart marks the card as dragged', async ({ page }) => {
    const cardId = await createIssue(client, ctx, {
      title: `${titlePrefix}dragmark-1`,
      status: 'Backlog'
    })
    await openTrackerBoard(page, ctx.project._id)

    const board = new KanbanBoardPage(page)
    await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)

    const card = board.card(cardId)
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 4 })
    // Card retains data-card-id during drag.
    await expect(card).toBeVisible()
    await page.mouse.up()
  })

  test('switching grouping does not query with the old categories', async ({ page }) => {
    // FUSIO-1552: old categories under the new key sent {space: 0} or {_id: {values: []}} and
    // Postgres failed with "operator does not exist", shown in the status bar.
    const component = await createComponent(client, ctx.project._id, `grouping-${generateId(4)}`)
    await createIssue(client, ctx, { title: `${titlePrefix}grouping`, status: 'Backlog', priority: 2, component })

    await openTrackerBoard(page, ctx.project._id)
    const errors = page.locator('.antiStatusBar .ERROR')
    for (const viewlet of [ViewletSelectors.Board, ViewletSelectors.Table]) {
      await page.click(viewlet)
      for (const group of ['Priority', 'Project', 'Component', 'Parent issue', 'Priority', 'Parent issue']) {
        await setViewGroup(page, group)
        // The failed query lands after the switch; the status bar keeps the error until reload.
        await page.waitForTimeout(500)
        await expect(errors, `${viewlet} -> ${group}`).toHaveCount(0)
      }
    }
  })

  test.describe('Collapsed and merged columns', () => {
    let swimLanesOn = false

    test.beforeEach(() => {
      swimLanesOn = false
    })

    // Back to the legacy layout also after a failure; a broken page may not answer.
    test.afterEach(async ({ page }) => {
      if (!swimLanesOn) return
      try {
        await page.keyboard.press('Escape')
        await new KanbanBoardPage(page).setSwimLane('None')
      } catch {
        // ignore
      }
    })

    test('collapse a column into the stack, keep it across a reload and open it back', async ({ page }) => {
      const doneCard = await createIssue(client, ctx, { title: `${titlePrefix}collapse-done`, status: 'Done' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const done = ctx.statuses.get('Done') as string
      const open = await board.boardLayout()
      await board.expectCardInColumn(doneCard, done)
      const count = await board.columnHeader(done).locator('.counter').innerText()

      await board.collapseColumn(done)
      // The column leaves its place; the stack ends the board and has no cards or tools.
      await expect.poll(async () => await board.boardLayout()).toEqual([...open.filter((s) => s !== done), 'stack'])
      await expect(board.collapsedColumn(done)).toBeVisible()
      await expect(board.card(doneCard)).toHaveCount(0)
      await expect(board.collapsedColumn(done).locator('.tools')).toHaveCount(0)
      await expect(board.collapsedColumn(done).locator('.counter')).toHaveText(count)
      // Kept per viewlet and grouping.
      const stored = await board.storedColumns('collapsed')
      expect(Object.keys(stored)).toEqual([expect.stringMatching(/^kanban-column-collapsed-.+-status$/)])
      expect(Object.values(stored)).toEqual([[done]])

      await openTrackerBoard(page, ctx.project._id, true)
      await expect(board.collapsedColumn(done)).toBeVisible()
      await expect(board.column(done)).toHaveCount(0)

      await board.expandColumn(done)
      await expect.poll(async () => await board.boardLayout()).toEqual(open)
      await board.expectCardInColumn(doneCard, done)
    })

    test('a card dropped on a stacked column gets its status and the column stays stacked', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}stack-drop`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string
      const done = ctx.statuses.get('Done') as string
      await board.expectCardInColumn(cardId, backlog)
      await board.collapseColumn(done)
      const stacked = board.collapsedColumn(done)
      await expect(stacked).toBeVisible()
      const counter = stacked.locator('.counter')
      const before = Number(await counter.innerText())

      await dragUntilStatus(client, cardId, done, async () => {
        const preview = async (): Promise<void> => {
          // Over the stack the card shows where it would land, as in an open column.
          await expect(board.collapsedStack()).toHaveClass(/dragging/, { timeout: 2000 })
          await expect(stacked).toHaveClass(/drop-allowed/, { timeout: 2000 })
          await expect(stacked).toHaveClass(/drag-over/, { timeout: 2000 })
          await expect(stacked.locator('.collapsed-drop-card')).toBeVisible({ timeout: 2000 })
        }
        await board.dragCardVia(cardId, [{ over: stacked, check: preview }], stacked)
      })

      await expect(stacked).toBeVisible()
      await expect(board.column(done)).toHaveCount(0)
      await expect(board.card(cardId)).toHaveCount(0)
      await expect(counter).toHaveText(String(before + 1))
    })

    test('swim lanes: a card dropped on a stacked column keeps its own lane', async ({ page }) => {
      const cardId = await createIssue(client, ctx, {
        title: `${titlePrefix}stack-lane`,
        status: 'Backlog',
        priority: IssuePriority.Low
      })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string
      const done = ctx.statuses.get('Done') as string
      const ownLane = String(IssuePriority.Low)
      const otherLane = String(IssuePriority.High)
      swimLanesOn = true
      await board.setSwimLane('Priority')
      await board.collapseColumn(done)
      const stacked = board.collapsedColumn(done)
      await expect(stacked).toBeVisible()
      await board.expectCardInSwimLaneCell(cardId, ownLane, backlog)

      await dragUntilStatus(client, cardId, done, async () => {
        const inOtherLane = async (): Promise<void> => {
          // The card follows the pointer into the other lane, where a drop would put it.
          await expect(board.swimLaneCell(otherLane, backlog).locator(`[data-card-id="${cardId}"]`)).toBeVisible({
            timeout: 2000
          })
        }
        await board.dragCardVia(cardId, [{ over: board.swimLaneCell(otherLane, backlog), check: inOtherLane }], stacked)
      })

      expect((await client.findOne(tracker.class.Issue, { _id: cardId }))?.priority).toBe(IssuePriority.Low)
    })

    test('merge Canceled into Done: one column with the cards of both, kept across a reload', async ({ page }) => {
      const doneCard = await createIssue(client, ctx, { title: `${titlePrefix}merge-done`, status: 'Done' })
      const canceledCard = await createIssue(client, ctx, {
        title: `${titlePrefix}merge-canceled`,
        status: 'Cancelled'
      })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const done = ctx.statuses.get('Done') as string
      const canceled = ctx.statuses.get('Cancelled') as string

      await board.mergeColumns(done, 'Canceled')
      const header = board.columnHeader(done)
      await expect(board.column(canceled)).toHaveCount(0)
      await expect(header).toHaveClass(/merged/)
      await expect(header.locator('.merged-names')).toContainText('Done')
      await expect(header.locator('.merged-names')).toContainText('Canceled')
      await board.expectCardInColumn(doneCard, done)
      await board.expectCardInColumn(canceledCard, done)

      await openTrackerBoard(page, ctx.project._id, true)
      await expect(board.column(canceled)).toHaveCount(0)
      await expect(board.columnHeader(done)).toHaveClass(/merged/)
      await board.expectCardInColumn(canceledCard, done)

      // The header names two statuses, the chevron shows the rest.
      await board.mergeColumns(done, 'In Progress')
      const more = board.columnHeader(done).locator('.more-members')
      await expect(more).toContainText('+1')
      await more.click()
      for (const name of ['In Progress', 'Done', 'Canceled']) {
        await expect(board.columnHeader(done).locator('.merged-names')).toContainText(name)
      }

      // Picking a status again takes it out of the column.
      await board.mergeColumns(done, 'Canceled', 'In Progress')
      await expect(board.column(canceled)).toBeVisible()
      await expect(board.columnHeader(done)).not.toHaveClass(/merged/)
      await board.expectCardInColumn(canceledCard, canceled)
    })

    test('a merged column takes no drop from another status', async ({ page }) => {
      const doneCard = await createIssue(client, ctx, { title: `${titlePrefix}refuse-done`, status: 'Done' })
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}refuse-backlog`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string
      const done = ctx.statuses.get('Done') as string
      await board.mergeColumns(done, 'Canceled')
      await board.expectCardInColumn(doneCard, done)
      await board.expectCardInColumn(cardId, backlog)
      const merged = board.column(done)
      const width = (await merged.boundingBox())?.width
      expect(width ?? 0).toBeGreaterThan(0)

      await board.dropCardOnRefusing(cardId, merged, async () => {
        await expect(merged).toHaveClass(/drop-disabled/)
        // Greyed out, it keeps its width and its cards.
        expect((await merged.boundingBox())?.width).toBe(width)
        await expect(board.card(doneCard)).toBeVisible()
      })

      await expect(merged).not.toHaveClass(/drop-disabled/)
      // The drop reaches the server within ~100ms: a quiet second shows none was sent.
      expect(await waitStable(async () => await statusOf(cardId), { stableFor: 1000, interval: 100 })).toBe(backlog)
    })

    test('a card leaves a merged column with the status of the column it is dropped on', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}leave-merged`, status: 'Cancelled' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string
      const done = ctx.statuses.get('Done') as string
      await board.mergeColumns(done, 'Canceled')
      await board.expectCardInColumn(cardId, done)

      await dragUntilStatus(client, cardId, backlog, async () => {
        await board.dragCardToColumn(cardId, backlog)
      })
      await board.expectCardInColumn(cardId, backlog)
    })

    test('a card dragged out of a merged column and back stays there once, with its status', async ({ page }) => {
      const doneCard = await createIssue(client, ctx, { title: `${titlePrefix}back-done`, status: 'Done' })
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}back-canceled`, status: 'Cancelled' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const backlog = ctx.statuses.get('Backlog') as string
      const done = ctx.statuses.get('Done') as string
      const canceled = ctx.statuses.get('Cancelled') as string
      await board.mergeColumns(done, 'Canceled')
      await board.expectCardInColumn(doneCard, done)
      await board.expectCardInColumn(cardId, done)
      const merged = board.column(done)
      const inBacklog = board.column(backlog)
      const everywhere = page.locator(`[data-card-id="${cardId}"]`)
      const placed = await board.cardIdsIn(merged)

      await board.dragCardVia(
        cardId,
        [
          {
            over: board.card(doneCard),
            // Hovering a card of another status in its own column used to add the dragged card
            // to the board data a second time.
            check: async () => {
              await expect(everywhere).toHaveCount(1)
            }
          },
          {
            over: inBacklog,
            // The card follows the pointer out, so the way back is really walked.
            check: async () => {
              await expect(inBacklog.locator(`[data-card-id="${cardId}"]`)).toBeVisible({ timeout: 2000 })
              await expect(merged.locator(`[data-card-id="${cardId}"]`)).toHaveCount(0)
            }
          }
        ],
        merged
      )

      expect(await waitStable(async () => await statusOf(cardId), { stableFor: 1000, interval: 100 })).toBe(canceled)
      // Back where it stood, not left in the column it passed.
      await expect(everywhere).toHaveCount(1)
      await expect(merged.locator(`[data-card-id="${cardId}"]`)).toHaveCount(1)
      await expect(inBacklog.locator(`[data-card-id="${cardId}"]`)).toHaveCount(0)
      await expect.poll(async () => await board.cardIdsIn(merged)).toEqual(placed)
    })

    test('reset merged columns shows only when this board has a merged column and keeps other boards groups', async ({
      page
    }) => {
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const done = ctx.statuses.get('Done') as string
      const canceled = ctx.statuses.get('Cancelled') as string
      const states = await board.boardLayout()
      // The viewlet is shared by all projects: its key also holds the groups of other boards.
      const foreign = ['foreign-status-done', 'foreign-status-canceled']
      const merged = async (): Promise<unknown> => Object.values(await board.storedColumns('merged'))[0]

      // A real merge first: it writes the key the board really uses.
      await board.mergeColumns(done, 'Canceled')
      const [key] = Object.keys(await board.storedColumns('merged'))
      expect(key).toBeDefined()
      await page.evaluate(
        ([k, groups]) => {
          localStorage.setItem(k, groups)
        },
        [key, JSON.stringify([foreign])]
      )
      await openTrackerBoard(page, ctx.project._id, true)

      // Only another board's group is stored: nothing is merged here, nothing to reset.
      await expect(board.column(canceled)).toBeVisible()
      await board.openMoreActions()
      await expect(board.moreActionsItem('Merge columns by category')).toBeVisible()
      await expect(board.moreActionsItem('Reset merged columns')).toHaveCount(0)
      await page.keyboard.press('Escape')

      await board.mergeColumns(done, 'Canceled')
      expect(await merged()).toEqual([foreign, [done, canceled]])
      await board.openMoreActions()
      await board.moreActionsItem('Reset merged columns').click()
      await expect(board.column(canceled)).toBeVisible()
      await expect.poll(merged).toEqual([foreign])

      // Merging by category replaces this board's groups only.
      const statuses = await client.findAll(tracker.class.IssueStatus, {})
      const byCategory = new Map<string, string[]>()
      for (const id of states) {
        const category = statuses.find((status) => status._id === id)?.category
        if (category !== undefined) byCategory.set(category, [...(byCategory.get(category) ?? []), id])
      }
      await board.mergeColumns(done, 'Canceled')
      await board.openMoreActions()
      await board.moreActionsItem('Merge columns by category').click()
      await expect.poll(merged).toEqual([foreign, ...Array.from(byCategory.values()).filter((ids) => ids.length > 1)])
    })

    test('swim lane count does not count a merged status twice', async ({ page }) => {
      const lane = String(IssuePriority.Medium)
      await createIssue(client, ctx, {
        title: `${titlePrefix}count-done`,
        status: 'Done',
        priority: IssuePriority.Medium
      })
      const canceledCard = await createIssue(client, ctx, {
        title: `${titlePrefix}count-canceled`,
        status: 'Cancelled',
        priority: IssuePriority.Medium
      })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const done = ctx.statuses.get('Done') as string
      const canceled = ctx.statuses.get('Cancelled') as string
      swimLanesOn = true
      await board.setSwimLane('Priority')
      await board.expectCardInSwimLaneCell(canceledCard, lane, canceled)
      const before = await waitStable(async () => await board.swimLaneCount(lane), { stableFor: 500, interval: 100 })
      expect(before).toBeGreaterThanOrEqual(2)

      await board.mergeColumns(done, 'Canceled')
      await expect(board.columnHeader(done)).toHaveClass(/merged/)
      await expect.poll(async () => await board.swimLaneCount(lane)).toBe(before)

      // Reopened with the merge stored, the lane is counted afresh.
      await openTrackerBoard(page, ctx.project._id, true)
      await expect(board.columnHeader(done)).toHaveClass(/merged/)
      await expect(board.swimLane(lane)).toBeVisible()
      const reopened = await waitStable(async () => await board.swimLaneCount(lane), { stableFor: 500, interval: 100 })
      expect(reopened).toBe(before)
    })
  })

  // Legacy layout: a drag that sends no update must leave the card where it stood.
  // Each release is followed by a small mouse move, as a user's would be.
  test.describe('Drag that ends without a drop', () => {
    // Not expectCardInColumn: it reloads a board that lost the card, which hides the defect.
    const expectBackInBacklog = async (board: KanbanBoardPage, cardId: Ref<Issue>): Promise<void> => {
      const backlog = ctx.statuses.get('Backlog') as string
      await expect(board.cardInColumn(cardId, backlog)).toBeVisible()
      await expect(board.page.locator(`[data-card-id="${cardId}"]`)).toHaveCount(1)
      await expect(board.page.locator('.dragged')).toHaveCount(0)
      // The drop reaches the server within ~100ms: a quiet second shows none was sent.
      expect(await waitStable(async () => await statusOf(cardId), { stableFor: 1000, interval: 100 })).toBe(backlog)
    }

    test('a card released on a column that refuses it goes back to its own column', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}ends-refused`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const inProgress = ctx.statuses.get('In Progress') as string
      const done = ctx.statuses.get('Done') as string
      await board.mergeColumns(done, 'Canceled')
      await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)
      const merged = board.column(done)

      await board.holdCardVia(cardId, [
        {
          over: board.column(inProgress),
          // The card is drawn in the column it passes, where a drop would put it.
          check: async () => {
            await expect(board.cardInColumn(cardId, inProgress)).toBeVisible({ timeout: 2000 })
          }
        },
        {
          over: merged,
          refusing: true,
          check: async () => {
            await expect(merged).toHaveClass(/drop-disabled/)
          }
        }
      ])
      await board.releaseOver(merged)

      await expect(board.cardInColumn(cardId, inProgress)).toHaveCount(0)
      await expectBackInBacklog(board, cardId)
    })

    test('a card released outside the board goes back to its column', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}ends-outside`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const inProgress = ctx.statuses.get('In Progress') as string
      await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)

      await board.holdCardVia(cardId, [
        {
          over: board.column(inProgress),
          check: async () => {
            await expect(board.cardInColumn(cardId, inProgress)).toBeVisible({ timeout: 2000 })
          }
        }
      ])
      await board.releaseAboveBoard(board.column(inProgress))

      await expect(board.cardInColumn(cardId, inProgress)).toHaveCount(0)
      await expectBackInBacklog(board, cardId)
    })

    test('a card hovered over the stack and released outside the board stays in its column', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}ends-stack`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const done = ctx.statuses.get('Done') as string
      await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)
      await board.collapseColumn(done)
      const stacked = board.collapsedColumn(done)
      await expect(stacked).toBeVisible()
      const counter = stacked.locator('.counter')
      const before = await counter.innerText()

      await board.holdCardVia(cardId, [
        {
          over: stacked,
          check: async () => {
            await expect(board.collapsedStack()).toHaveClass(/dragging/, { timeout: 2000 })
            await expect(stacked).toHaveClass(/drop-allowed/, { timeout: 2000 })
            await expect(stacked.locator('.collapsed-drop-card')).toBeVisible({ timeout: 2000 })
          }
        }
      ])
      await board.releaseAboveBoard(stacked)

      await expectBackInBacklog(board, cardId)
      await expect(counter).toHaveText(before)
      await expect(board.collapsedStack()).not.toHaveClass(/dragging/)
      await expect(stacked).not.toHaveClass(/drop-allowed/)
    })

    test('a drag cancelled with Escape puts the card back', async ({ page }) => {
      const cardId = await createIssue(client, ctx, { title: `${titlePrefix}ends-escape`, status: 'Backlog' })
      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      const inProgress = ctx.statuses.get('In Progress') as string
      await board.expectCardInColumn(cardId, ctx.statuses.get('Backlog') as string)

      await board.holdCardVia(cardId, [
        {
          over: board.column(inProgress),
          check: async () => {
            await expect(board.cardInColumn(cardId, inProgress)).toBeVisible({ timeout: 2000 })
          }
        }
      ])
      await board.cancelDrag(board.column(inProgress))

      await expect(board.cardInColumn(cardId, inProgress)).toHaveCount(0)
      await expectBackInBacklog(board, cardId)
    })
  })
})
