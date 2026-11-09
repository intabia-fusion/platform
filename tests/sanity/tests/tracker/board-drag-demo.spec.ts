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

import { createRestClient } from '@hcengineering/api-client'
import core, { generateId, SortingOrder, type Ref, type TxOperations } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tracker, {
  IssuePriority,
  IssuesOrdering,
  type Board,
  type Issue,
  type IssueStatus
} from '@hcengineering/tracker'
import { expect, test, type Locator, type Page } from '../fixtures'
import { connectTracker, createIssue, deleteIssuesByTitlePrefix, getProjectContext } from '../API/TrackerApi'
import { KanbanBoardPage } from '../model/tracker/kanban-board-page'
import { LoginPage } from '../model/login-page'
import { SelectWorkspacePage } from '../model/select-workspace-page'
import { PlatformURI } from '../utils'
import { ViewletSelectors } from './tracker.utils'

// The documentation stand seeds this workspace: tests/prepare-pg.sh --docs.
// Opt-in keeps the ordinary sanity suite independent of the demo import.
const enabled = process.env.BOARD_DEMO === '1'
const workspace = 'demo-ws-en'
const prefix = `board-drag-demo-${generateId()}-`
let storage: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>
let client: TxOperations
let boardId: Ref<Board> | undefined
const issueIds: Array<Ref<Issue>> = []
let seed: Issue[] = []
let ctx: Awaited<ReturnType<typeof getProjectContext>>
let author: Board['author']
let navigation: import('@hcengineering/tracker').BoardNavigationPreference | undefined

const demo = test.extend({
  // eslint-disable-next-line no-empty-pattern
  storageState: async ({}, use) => {
    await use(storage)
  }
})
demo.use({ viewport: { width: 1600, height: 1000 } })
demo.skip(!enabled, 'BOARD_DEMO=1 requires the demo-ws-en workspace')

function statusId (name: 'Todo' | 'Backlog' | 'In Progress'): Ref<IssueStatus> {
  const id = ctx.statuses.get(name)
  if (id === undefined) throw new Error(`Demo status ${name} is missing`)
  return id
}

async function bounds (target: Locator): Promise<{ x: number, y: number, width: number, height: number }> {
  const box = await target.boundingBox()
  if (box === null) throw new Error('Drag target has no bounding box')
  return box
}

async function hover (page: Page, target: Locator, fraction: number = 0.5): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  const box = await bounds(target)
  const x = box.x + box.width / 2
  const y = box.y + box.height * fraction
  await page.mouse.move(x, y, { steps: 6 })
  await page.mouse.move(x + 1, y)
  await page.mouse.move(x, y)
}

async function openAllIssues (page: Page): Promise<void> {
  await page.goto(`${PlatformURI}/workbench/${workspace}/tracker`)
  await page.getByRole('link', { name: 'All issues', exact: true }).click()
  await page.locator(ViewletSelectors.Board).click()
  await expect(page.locator('[data-id="kanban-card"]').first()).toBeVisible()
}

async function snapshot (): Promise<unknown> {
  const docs = await client.findAll(tracker.class.Issue, { _id: { $in: issueIds } })
  return docs
    .sort((a, b) => a._id.localeCompare(b._id))
    .map(({ _id, status, rank, modifiedOn }) => ({
      _id,
      status,
      rank,
      modifiedOn
    }))
}

async function cleanDrag (page: Page): Promise<void> {
  await expect(
    page.locator(
      '[data-drop-target], [data-dragged="true"], .kanban-container .drop-allowed, .kanban-container .drop-disabled'
    )
  ).toHaveCount(0, { timeout: 2500 })
  await expect(page.locator('.popupPanel')).toHaveCount(0, { timeout: 2500 })
}

demo.beforeAll(async ({ browser }) => {
  if (!enabled) return
  const conn = await connectTracker(workspace, 'demo-en1')
  client = conn.client
  author = (
    await createRestClient(
      conn.workspaceToken.endpoint,
      conn.workspaceToken.workspaceId,
      conn.workspaceToken.token
    ).getAccount()
  ).uuid
  const project = await client.findOne(tracker.class.Project, { identifier: 'APP' })
  if (project === undefined) throw new Error('Demo project APP is missing; run tests/prepare-pg.sh --docs')
  ctx = await getProjectContext(client, project._id)
  seed = await client.findAll(tracker.class.Issue, { space: project._id }, { sort: { number: 1 }, limit: 8 })
  expect(seed.length).toBeGreaterThanOrEqual(3)
  navigation = await client.findOne(tracker.class.BoardNavigationPreference, {
    attachedTo: 'tracker:boards-navigation'
  })
  for (const [index, source] of seed.entries()) {
    issueIds.push(
      await createIssue(client, ctx, {
        title: `${prefix}${index} ${source.title}`,
        status: 'Todo',
        priority: IssuePriority.Medium,
        estimation: source.estimation,
        assignee: source.assignee,
        component: source.component,
        dueDate: source.dueDate,
        rank: makeRank(undefined, undefined)
      })
    )
  }
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    await page.goto(PlatformURI)
    await new LoginPage(page).login('demo-en1', '1234')
    await new SelectWorkspacePage(page).selectWorkspace(workspace)
    await page.waitForURL(`**/workbench/${workspace}/**`)
    storage = await context.storageState()
  } finally {
    await context.close()
  }
})

demo.afterEach(async ({ page }) => {
  await page.keyboard.press('Escape')
  await page.mouse.up()
  if (boardId !== undefined) {
    for (const preference of await client.findAll(tracker.class.BoardPreference, { attachedTo: boardId })) {
      await client.remove(preference)
    }
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board !== undefined) await client.remove(board)
    boardId = undefined
  }
})

demo.afterAll(async () => {
  if (client === undefined) return
  await deleteIssuesByTitlePrefix(client, prefix)
  const current = await client.findOne(tracker.class.BoardNavigationPreference, {
    attachedTo: 'tracker:boards-navigation'
  })
  if (current !== undefined) {
    if (navigation === undefined) await client.remove(current)
    else await client.update(current, { boards: navigation.boards })
  }
})

for (const swim of [false, true]) {
  demo.describe(`demo native drag, swim lanes: ${swim}`, () => {
    let source: Locator
    let destination: Locator
    let board: KanbanBoardPage
    let ids: string[]
    let before: unknown

    async function open (page: Page, manual: boolean = false, single: boolean = false): Promise<void> {
      let rank: string | undefined
      for (const id of issueIds) {
        const doc = await client.findOne(tracker.class.Issue, { _id: id })
        if (doc === undefined) throw new Error(`Demo copy ${id} disappeared`)
        rank = makeRank(rank, undefined)
        await client.update(doc, { status: ctx.statuses.get('Todo'), rank })
      }
      const attribute = client.getHierarchy().getAttribute(tracker.class.Issue, 'title')
      boardId = await client.createDoc(tracker.class.Board, core.space.Workspace, {
        title: `${prefix}board`,
        projects: [ctx.project._id],
        author,
        editors: [],
        visibility: 'all',
        filter: JSON.stringify([
          {
            key: {
              _class: tracker.class.Issue,
              key: 'title',
              attribute,
              label: attribute.label,
              component: 'view:component:StringFilter',
              group: 'top'
            },
            value: [prefix],
            mode: 'view:filter:FilterContains',
            modes: ['view:filter:FilterContains']
          }
        ]),
        columns: [
          {
            id: 'queue',
            title: 'Queue',
            category: task.statusCategory.ToDo,
            statuses: single ? [statusId('Todo')] : [statusId('Todo'), statusId('Backlog')]
          },
          { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
        ],
        orderBy: manual
          ? [IssuesOrdering.Manual, SortingOrder.Ascending]
          : [IssuesOrdering.LastUpdated, SortingOrder.Descending],
        swimLaneBy: swim ? 'priority' : null,
        swimlanes: [],
        quickFilters: [],
        colorRules: [],
        density: 'normal'
      })
      await page.goto(`${PlatformURI}/workbench/${workspace}/tracker/boards/${boardId}`)
      board = new KanbanBoardPage(page)
      source = swim ? board.swimLaneCell(String(IssuePriority.Medium), 'queue') : board.column('queue')
      destination = swim ? board.swimLaneCell(String(IssuePriority.Medium), 'doing') : board.column('doing')
      await expect(source.locator('[data-id="kanban-card"]').nth(2)).toBeVisible()
      await expect(page.locator('[data-id="kanban-loading"]')).toHaveCount(0)
      ids = await board.cardIdsIn(source)
      before = await snapshot()
    }

    for (const index of [0, 1, 2]) {
      for (const ending of ['shifted', 'via-column', 'escape', 'scroll', 'hold', 'current-status']) {
        demo(`card ${index + 1} cancels by ${ending} without writes or jumping`, async ({ page }) => {
          await open(page)
          const card = board.card(ids[index])
          if (ending === 'hold') {
            const box = await bounds(card)
            await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10)
            await page.mouse.down()
            await page.waitForTimeout(600)
            await page.mouse.up()
          } else {
            if (ending === 'scroll') {
              const scroller = await board.card(ids[index]).evaluateHandle((el) => {
                let parent = el.parentElement
                while (parent !== null && !/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
                  parent = parent.parentElement
                }
                if (parent === null) throw new Error('Card has no scroll container')
                parent.scrollTop = 40
                return parent
              })
              expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
              await scroller.dispose()
            }
            await board.holdCardVia(ids[index], [])
            await hover(page, source.locator('[data-id="kanban-card"]').first(), 0.2)
            await expect(source.locator('[data-drop-target]')).toHaveCount(2)
            for (let n = 0; n < 6; n++) {
              await hover(page, source.locator('[data-id="kanban-card"]').first(), 0.2)
              expect(await board.cardIdsIn(source)).toEqual(ids)
            }
            const firstSpot = await bounds(source.locator('[data-drop-target]').first())
            for (let n = 0; n < 12; n++) {
              await page.mouse.move(firstSpot.x + 25 + (n % 2), firstSpot.y + firstSpot.height + 2)
              expect(await board.cardIdsIn(source)).toEqual(ids)
              await expect(source.locator('[data-drop-target]')).toHaveCount(2)
            }
            if (ending === 'via-column' || ending === 'escape') {
              await hover(page, destination)
              await expect(card).toBeVisible({ timeout: 2500 })
              expect(await board.cardIdsIn(source)).toEqual(ids)
            }
            if (ending === 'escape' || ending === 'scroll') await page.keyboard.press('Escape')
            else {
              await hover(
                page,
                ending === 'current-status' ? source.locator(`[data-drop-target="${statusId('Todo')}"]`) : card
              )
            }
            await page.mouse.up()
          }
          await cleanDrag(page)
          expect(await board.cardIdsIn(source)).toEqual(ids)
          await expect.poll(snapshot).toEqual(before)
          await page.waitForTimeout(200)
          expect(await snapshot()).toEqual(before)
        })
      }

      for (const target of ['current-column', 'other-column']) {
        demo(`card ${index + 1} selects status in ${target}`, async ({ page }) => {
          await open(page)
          const status = statusId(target === 'current-column' ? 'Backlog' : 'In Progress')
          const cell = target === 'current-column' ? source : destination
          await board.holdCardVia(ids[index], [])
          await hover(page, cell)
          const spot = cell.locator(`[data-drop-target="${status}"]`)
          await expect(spot).toBeVisible()
          await hover(page, spot)
          await page.mouse.up()
          await cleanDrag(page)
          await expect
            .poll(async () => (await client.findOne(tracker.class.Issue, { _id: ids[index] as Ref<Issue> }))?.status)
            .toBe(status)
          await page.reload()
          await expect(board.card(ids[index])).toBeVisible()
          const expectedCell = target === 'current-column' ? source : destination
          await expect(expectedCell.locator(`[data-card-id="${ids[index]}"]`)).toBeVisible()
        })
      }
    }

    for (const single of [false, true]) {
      demo(`manual reorder returns to the original slot without writes, single status: ${single}`, async ({ page }) => {
        await open(page, true, single)
        await board.holdCardVia(ids[0], [{ over: destination }])
        await expect(source.locator('[data-drop-target]')).toHaveCount(single ? 1 : 2)
        await board.card(ids[2]).scrollIntoViewIfNeeded()
        const origin = await bounds(board.card(ids[0]))
        await hover(page, board.card(ids[2]), 0.8)
        await expect.poll(async () => (await board.cardIdsIn(source)).indexOf(ids[0]), { timeout: 2500 }).toBe(2)
        await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2, { steps: 6 })
        await page.mouse.move(origin.x + origin.width / 2 + 1, origin.y + origin.height / 2)
        await page.mouse.up()
        await cleanDrag(page)
        expect(await board.cardIdsIn(source)).toEqual(ids)
        expect(await snapshot()).toEqual(before)
      })

      demo(`manual reorder persists after hovering the moved card, single status: ${single}`, async ({ page }) => {
        await open(page, true, single)
        const original = await client.findOne(tracker.class.Issue, { _id: ids[0] as Ref<Issue> })
        await board.holdCardVia(ids[0], [{ over: destination }])
        await expect(source.locator('[data-drop-target]')).toHaveCount(single ? 1 : 2)
        await hover(page, board.card(ids[2]), 0.8)
        await expect.poll(async () => (await board.cardIdsIn(source)).indexOf(ids[0]), { timeout: 2500 }).toBe(2)
        await hover(page, board.card(ids[0]))
        const order = await board.cardIdsIn(source)
        expect(order.indexOf(ids[0])).toBe(2)
        await page.mouse.up()
        await cleanDrag(page)
        await expect
          .poll(async () => (await client.findOne(tracker.class.Issue, { _id: ids[0] as Ref<Issue> }))?.rank)
          .not.toBe(original?.rank)
        await page.reload()
        await expect.poll(async () => (await board.cardIdsIn(source)).indexOf(ids[0]), { timeout: 2500 }).toBe(2)
      })
    }

    if (swim) {
      demo('status preview in an earlier lane keeps the source lane in place', async ({ page }) => {
        await open(page)
        await board.holdCardVia(ids[1], [])
        await hover(page, source.locator('[data-id="kanban-card"]').first(), 0.2)
        await expect(source.locator('[data-drop-target]')).toHaveCount(2)
        const top = (await bounds(source)).y
        const upper = board.swimLaneCell(String(IssuePriority.High), 'doing')
        const spot = upper.locator(`[data-drop-target="${statusId('In Progress')}"]`)
        await hover(page, spot)
        await expect(spot.locator('.drop-target-card')).toBeVisible()
        expect((await bounds(source)).y).toBe(top)
        await page.keyboard.press('Escape')
        await page.mouse.up()
        await cleanDrag(page)
        expect(await snapshot()).toEqual(before)
      })
    }

    demo('loading status is visible while real server responses are delayed', async ({ page }) => {
      const timers = new Set<ReturnType<typeof setTimeout>>()
      await page.routeWebSocket('**/*', (socket) => {
        const server = socket.connectToServer()
        server.onMessage((message) => {
          const timer = setTimeout(() => {
            timers.delete(timer)
            socket.send(message)
          }, 250)
          timers.add(timer)
        })
      })
      await page.addInitScript(() => {
        const state = { seen: false }
        ;(window as any).__demoKanbanLoading = state
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (!(node instanceof Element)) continue
              if (
                node.matches('[data-id="kanban-loading"]') ||
                node.querySelector('[data-id="kanban-loading"]') !== null
              ) {
                state.seen = true
              }
            }
          }
        }).observe(document, { childList: true, subtree: true })
      })
      try {
        await open(page)
        expect(await page.evaluate(() => (window as any).__demoKanbanLoading.seen)).toBe(true)
        await expect(page.locator('[data-id="kanban-loading"]')).toHaveCount(0)
        expect(await board.cardIdsIn(source)).toEqual(ids)
      } finally {
        for (const timer of timers) clearTimeout(timer)
      }
    })

    demo('merged destination refuses the drag without changing documents', async ({ page }) => {
      await open(page)
      await openAllIssues(page)
      await board.setSwimLane(swim ? 'Priority' : 'None')
      const doing = statusId('In Progress')
      await board.mergeColumns(doing, 'Backlog')
      await expect(board.columnHeader(doing)).toHaveClass(/merged/)
      const merged = swim ? board.swimLaneCell(String(IssuePriority.Medium), doing) : board.column(doing)
      await board.holdCardVia(ids[1], [{ over: merged, refusing: true }])
      await expect(merged).toHaveClass(/drop-disabled/)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await cleanDrag(page)
      expect(await snapshot()).toEqual(before)
    })

    demo('collapsed destination cancels without changing status or rank', async ({ page }) => {
      await open(page)
      await openAllIssues(page)
      await board.setSwimLane(swim ? 'Priority' : 'None')
      const doing = statusId('In Progress')
      await board.collapseColumn(doing)
      await board.holdCardVia(ids[1], [{ over: board.collapsedColumn(doing) }])
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await cleanDrag(page)
      expect(await snapshot()).toEqual(before)
    })
  })
}

demo('display option with unchanged projection finishes loading', async ({ page }) => {
  await openAllIssues(page)
  await expect(page.locator('[data-id="kanban-loading"]')).toHaveCount(0)
  await page.locator('[data-id="btn-viewOptions"]').click()
  const colors = page.locator('.antiCard-menu__item', { hasText: 'Use colors' })
  await colors.click()
  try {
    await expect(page.locator('[data-id="kanban-loading"]')).toHaveCount(0, { timeout: 2500 })
  } finally {
    await colors.click()
    await page.keyboard.press('Escape')
  }
})
