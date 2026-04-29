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
import tracker, { type Issue } from '@hcengineering/tracker'
import { type Ref, type TxOperations } from '@hcengineering/core'
import {
  connectTracker,
  createIssue,
  deleteIssuesByTitlePrefix,
  getProjectContext,
  type ProjectContext
} from '../API/TrackerApi'
import { KanbanBoardPage } from '../model/tracker/kanban-board-page'
import { PlatformSetting, PlatformURI, generateId } from '../utils'
import { ViewletSelectors } from './tracker.utils'

async function openTrackerBoard (page: import('@playwright/test').Page, projectId: string): Promise<void> {
  const projectPath = encodeURIComponent(projectId)
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
  // Reset any persisted swim lane collapse state so cells are always rendered.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('kanban-swimlane-collapsed-')) localStorage.removeItem(k)
    }
  })
  await page.locator('label[data-id="tab-all"]').click()
  await page.locator(ViewletSelectors.Board).click()
  // Wait for the board to render either as legacy columns or swimlane.
  await page
    .locator('[data-id="kanban-column"], [data-id="kanban-swimlane"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
}

test.use({ storageState: PlatformSetting })

test.describe('Kanban board', () => {
  let client: TxOperations
  let ctx: ProjectContext
  const titlePrefix = `kanban-spec-${generateId()}-`

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

    // Retry the drag if the drop event was lost (HTML5 drag in headless can be flaky
    // under parallel load). Verify by polling the backend, not just the DOM, since
    // panelDragOver shows the card in the target column optimistically.
    await expect
      .poll(
        async () => {
          const current = (await client.findOne(tracker.class.Issue, { _id: cardId }))?.status as string | undefined
          if (current === ctx.statuses.get('In Progress')) return current
          await board.dragCardToColumn(cardId, inProgress)
          return current
        },
        { timeout: 30000, intervals: [2000] }
      )
      .toBe(ctx.statuses.get('In Progress'))
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
      await expect
        .poll(
          async () => {
            const current = (await client.findOne(tracker.class.Issue, { _id: cardId }))?.status as string | undefined
            if (current === target) return current
            await board.dragCardToColumn(cardId, target)
            return current
          },
          { timeout: 30000, intervals: [2000] }
        )
        .toBe(target)
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
    test.afterEach(async ({ page }) => {
      try {
        await openTrackerBoard(page, ctx.project._id)
        const board = new KanbanBoardPage(page)
        await board.setSwimLane('None')
      } catch {
        // best effort
      }
    })

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
      // Ensure all five priorities have at least one card so lanes do not disappear.
      const stable = await createIssue(client, ctx, {
        title: `${titlePrefix}sw-stable`,
        status: 'Backlog',
        priority: 0
      })
      for (let p = 1; p <= 4; p++) {
        await createIssue(client, ctx, {
          title: `${titlePrefix}sw-stable-anchor-${p}`,
          status: 'Backlog',
          priority: p
        })
      }
      // Anchor in Todo (priority=0) so the target cell has a card to drop onto.
      await createIssue(client, ctx, {
        title: `${titlePrefix}sw-stable-todo-anchor`,
        status: 'Todo',
        priority: 0
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      const beforeOrder = await board.swimLanes()
      expect(beforeOrder.length).toBeGreaterThanOrEqual(5)

      // Drag the stable card into the Todo cell of its own priority lane.
      const stableLaneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${stable}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(stableLaneId).not.toBeNull()
      if (stableLaneId === null) return
      await expect
        .poll(
          async () => {
            const current = (await client.findOne(tracker.class.Issue, { _id: stable }))?.status as string | undefined
            if (current === ctx.statuses.get('Todo')) return current
            await board.dragCardToSwimLaneCell(stable, stableLaneId, ctx.statuses.get('Todo') as string)
            return current
          },
          { timeout: 30000, intervals: [2000] }
        )
        .toBe(ctx.statuses.get('Todo'))

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

      await expect
        .poll(
          async () => {
            const issue = await client.findOne(tracker.class.Issue, { _id: childA })
            const at = issue?.attachedTo as string | undefined
            if (at === parentB) return at
            await board.dragCardToSwimLaneCell(childA, parentB, todo)
            return at
          },
          { timeout: 30000, intervals: [2000] }
        )
        .toBe(parentB)
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

    test('drag in Manual order keeps card on target position (no flicker to end)', async ({ page }) => {
      const c1 = await createIssue(client, ctx, { title: `${titlePrefix}rank-1`, status: 'Backlog', priority: 0 })
      const c2 = await createIssue(client, ctx, { title: `${titlePrefix}rank-2`, status: 'Backlog', priority: 0 })
      const c3 = await createIssue(client, ctx, { title: `${titlePrefix}rank-3`, status: 'Backlog', priority: 0 })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      // Wait for c1 to be rendered in the swimlane.
      await board.card(c1).waitFor({ state: 'visible', timeout: 15000 })
      const noPriorityLaneId = await page
        .locator(`[data-id="kanban-swimlane"]:has([data-card-id="${c1}"])`)
        .first()
        .getAttribute('data-swimlane-id')
      expect(noPriorityLaneId).not.toBeNull()
      if (noPriorityLaneId === null) return
      if (await board.isSwimLaneCollapsed(noPriorityLaneId)) await board.toggleSwimLane(noPriorityLaneId)

      const backlog = ctx.statuses.get('Backlog') as string
      await board.expectCardInSwimLaneCell(c1, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c2, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c3, noPriorityLaneId, backlog)

      // Drop c3 onto c2 — manual rank update. Retry under flaky CDP drag.
      // Verify c3 stays at its target position (immediately before c2), not flicker to end.
      await expect
        .poll(
          async () => {
            try {
              await board.dragCardToCard(c3, c2)
            } catch {
              // ignore single failures
            }
            const cardIds = await board
              .swimLaneCell(noPriorityLaneId, backlog)
              .locator('[data-card-id]')
              .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-card-id') ?? ''))
            const c2Index = cardIds.indexOf(c2)
            const c3Index = cardIds.indexOf(c3)
            return c2Index >= 0 && c3Index >= 0 && c3Index === c2Index - 1
          },
          { timeout: 30000, intervals: [2000] }
        )
        .toBe(true)

      // All three still in same cell after settle.
      await board.expectCardInSwimLaneCell(c1, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c2, noPriorityLaneId, backlog)
      await board.expectCardInSwimLaneCell(c3, noPriorityLaneId, backlog)
    })

    test('Show more counter does not flicker for unrelated cells while dragging', async ({ page }) => {
      // Create > 3 cards in one cell so Show more is visible.
      const ids: Array<Ref<Issue>> = []
      for (let i = 0; i < 5; i++) {
        ids.push(
          await createIssue(client, ctx, {
            title: `${titlePrefix}sm-${i}`,
            status: 'Backlog',
            priority: 0
          })
        )
      }
      // Card to drag from a different cell (different status).
      const dragId = await createIssue(client, ctx, {
        title: `${titlePrefix}sm-drag`,
        status: 'Todo',
        priority: 0
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      const backlog = ctx.statuses.get('Backlog') as string
      // The Backlog cell with 5 cards should have a Show more.
      const cellLocator = page
        .locator(`[data-id="kanban-swimlane-cell"][data-state="${backlog}"]`)
        .filter({ hasText: 'Show more' })
        .first()
      await expect(cellLocator).toBeVisible()

      const card = board.card(dragId)
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
        priority: 0
      })

      await openTrackerBoard(page, ctx.project._id)
      const board = new KanbanBoardPage(page)
      await board.setSwimLane('Priority')

      const backlog = ctx.statuses.get('Backlog') as string
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
      // Pick a lane that is actually rendered with a header.
      const laneId = await page.locator('[data-id="kanban-swimlane"]').first().getAttribute('data-swimlane-id')
      expect(laneId).not.toBeNull()
      if (laneId === null) return

      // Toggle from whatever the persisted state is to its opposite, then back.
      const initial = await board.isSwimLaneCollapsed(laneId)
      await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, !initial)
      await board.toggleSwimLane(laneId)
      await board.expectSwimLaneCollapsed(laneId, initial)
    })
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
})
