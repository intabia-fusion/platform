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
import core, {
  generateId,
  SortingOrder,
  type AccountUuid,
  type Data,
  type Ref,
  type TxOperations
} from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task from '@hcengineering/task'
import tracker, {
  cardFields,
  IssuePriority,
  IssuesOrdering,
  type Board,
  type BoardNavigationPreference,
  type CardField,
  type IssueStatus,
  type Project
} from '@hcengineering/tracker'
import { expect, test, type Locator } from '../fixtures'
import {
  connectTracker,
  createIssue,
  deleteIssuesByTitlePrefix,
  findProjectByName,
  getProjectContext,
  type ProjectContext,
  type StatusName
} from '../API/TrackerApi'
import { BoardsPage } from '../model/tracker/boards-page'
import { KanbanBoardPage } from '../model/tracker/kanban-board-page'
import { getSecondPage, PlatformSetting, PlatformURI, PlatformUserSecond } from '../utils'
import { ViewletSelectors } from './tracker.utils'

test.use({ storageState: PlatformSetting })

// Boards cover Second Project only: a project kanban opens the first board of the project
// by default, and the kanban specs of the default project must not meet them.
test.describe('task boards', () => {
  test.describe.configure({ mode: 'serial' })

  let client: TxOperations
  let ctx: ProjectContext
  let project: Project | undefined
  let boardId: Ref<Board>
  let author: AccountUuid
  let originalNavigation: BoardNavigationPreference | undefined
  const titlePrefix = `boards-spec-${generateId()}-`

  const readBoardById = async (id: Ref<Board>): Promise<Board | undefined> =>
    await client.findOne(tracker.class.Board, { _id: id })

  const readBoard = async (): Promise<Board | undefined> => await readBoardById(boardId)

  // Boards of the tests below: same project, own columns; the afterAll removes them by the title prefix
  const makeBoard = async (name: string, patch: Partial<Data<Board>> = {}): Promise<Ref<Board>> =>
    await client.createDoc(tracker.class.Board, core.space.Workspace, {
      title: `${titlePrefix}${name}`,
      projects: [project?._id as Ref<Project>],
      visibility: 'all',
      author,
      editors: [],
      filter: '',
      columns: [],
      swimlanes: [],
      quickFilters: [],
      colorRules: [],
      density: 'normal',
      ...patch
    })

  const statusId = (name: StatusName): Ref<IssueStatus> => ctx.statuses.get(name) as Ref<IssueStatus>

  // The JSON of a "Status is ..." condition, as the settings editor stores it
  const statusCondition = (...statuses: Array<Ref<IssueStatus>>): string => {
    const attribute = client.getHierarchy().getAttribute(tracker.class.Issue, 'status')
    return JSON.stringify([
      {
        key: {
          _class: tracker.class.Issue,
          key: 'status',
          attribute,
          label: attribute.label,
          component: 'task:component:StatusFilter',
          group: 'top'
        },
        value: statuses,
        index: 1,
        modes: ['view:filter:FilterObjectIn', 'view:filter:FilterObjectNin'],
        mode: 'view:filter:FilterObjectIn'
      }
    ])
  }

  test.beforeAll(async () => {
    const conn = await connectTracker()
    client = conn.client
    // The REST client sets no current account: ask the server who the test user is
    const { workspaceToken } = conn
    author = (
      await createRestClient(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token).getAccount()
    ).uuid
    originalNavigation = await client.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    project = await findProjectByName(client, 'Second Project')
    if (project === undefined) return
    ctx = await getProjectContext(client, project._id)
    const status = (name: 'Backlog' | 'Todo' | 'In Progress'): Ref<IssueStatus> =>
      ctx.statuses.get(name) as Ref<IssueStatus>
    await createIssue(client, ctx, { title: `${titlePrefix}backlog`, status: 'Backlog' })
    await createIssue(client, ctx, { title: `${titlePrefix}todo`, status: 'Todo' })
    await createIssue(client, ctx, { title: `${titlePrefix}doing`, status: 'In Progress' })
    boardId = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      title: `${titlePrefix}board`,
      projects: [project._id],
      visibility: 'all',
      author,
      editors: [],
      filter: '',
      columns: [
        {
          id: 'queue',
          title: 'Queue',
          category: task.statusCategory.ToDo,
          statuses: [status('Backlog'), status('Todo')],
          limit: 1
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [status('In Progress')] }
      ],
      swimlanes: [],
      quickFilters: [],
      colorRules: [],
      density: 'normal'
    })
  })

  test.beforeEach(() => {
    test.skip(project === undefined, 'Second Project not seeded')
  })

  test.afterAll(async () => {
    if (client === undefined) return
    // Every board of the spec, including the one the wizard test created
    const boards = await client.findAll(tracker.class.Board, {})
    for (const board of boards) {
      if (!board.title.startsWith(titlePrefix)) continue
      for (const pref of await client.findAll(tracker.class.BoardPreference, { attachedTo: board._id })) {
        await client.remove(pref)
      }
      await client.remove(board)
    }
    const navigation = await client.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    if (navigation !== undefined) {
      if (originalNavigation === undefined) await client.remove(navigation)
      else await client.update(navigation, { boards: originalNavigation.boards })
    }
    await deleteIssuesByTitlePrefix(client, titlePrefix)
  })

  test('columns of a board hold several statuses and the WIP limit turns red', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)

    await expect(boards.columns()).toHaveCount(2)
    // Backlog and Todo share the first column; board-settings.spec.ts puts its issues into the same project
    const own = (column: Locator): Locator => column.locator('[data-id="kanban-card"]', { hasText: titlePrefix })
    await expect(own(boards.columns().first())).toHaveCount(2)
    await expect(own(boards.columns().last())).toHaveCount(1)
    // 2 cards over the limit of 1: the limit and the cards area of the column are red
    await expect(boards.wipLimit()).toHaveClass(/over/)
    await expect(boards.columns().first().locator('.column-cards')).toHaveClass(/over-limit/)
  })

  test('a multi-status column reveals a landing spot per status it accepts', async ({ page }) => {
    const boards = new BoardsPage(page)
    const board = new KanbanBoardPage(page)
    const doing = await createIssue(client, ctx, { title: `${titlePrefix}spot`, status: 'In Progress' })
    await boards.open(boardId)
    const spots = board.column('queue').locator('[data-id="kanban-drop-targets"] [data-drop-target]')
    await board.holdCardVia(doing, [
      {
        over: board.column('doing'),
        check: async () => {
          await expect(spots).toHaveCount(2)
          await expect(board.cardInColumn(doing, 'queue')).toHaveCount(0)
        }
      },
      {
        over: board.column('queue'),
        check: async () => {
          await expect(spots).toHaveCount(2)
          await expect(spots.nth(0)).toHaveAttribute('data-drop-target', statusId('Backlog'))
          await expect(spots.nth(1)).toHaveAttribute('data-drop-target', statusId('Todo'))
        }
      }
    ])
    await board.releaseAboveBoard(board.column('queue'))
  })

  test('a drop on a landing spot sets exactly that status', async ({ page }) => {
    const boards = new BoardsPage(page)
    const board = new KanbanBoardPage(page)
    const id = await createIssue(client, ctx, { title: `${titlePrefix}spot-drop`, status: 'In Progress' })
    await boards.open(boardId)
    await board.dropCardOnDropTarget(id, 'queue', statusId('Todo'))
    await expect
      .poll(async () => (await client.findOne(tracker.class.Issue, { _id: id }))?.status)
      .toBe(statusId('Todo'))
  })

  test('returning a dragged card to its column preserves its position and rank', async ({ page }) => {
    const issueId = await createIssue(client, ctx, { title: `${titlePrefix}return-to-column`, status: 'Todo' })
    const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
    if (issue === undefined) throw new Error('the dragged issue is gone')
    const nextId = await createIssue(client, ctx, {
      title: `${titlePrefix}return-to-column-next`,
      status: 'Todo',
      rank: makeRank(issue.rank, undefined)
    })
    const id = await makeBoard('return-to-column', {
      orderBy: [IssuesOrdering.Manual, SortingOrder.Ascending],
      columns: [
        { id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ]
    })
    const boards = new BoardsPage(page)
    const board = new KanbanBoardPage(page)
    await boards.open(id)
    await board.revealCard(issueId)
    await board.revealCard(nextId)
    const queue = board.column('queue')
    const originalIds = await board.cardIdsIn(queue)
    const originalIndex = originalIds.indexOf(issueId)
    expect(originalIndex).toBeGreaterThanOrEqual(0)
    expect(originalIndex).toBeLessThan(originalIds.indexOf(nextId))

    const origin = await board.card(issueId).boundingBox()
    if (origin === null) throw new Error('the dragged card has no bounding box')
    await board.holdCardVia(issueId, [{ over: board.column('doing') }])
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2, { steps: 10 })
    await expect(board.cardInColumn(issueId, 'queue')).toBeVisible()
    const insertions = await queue.evaluateHandle((element) => {
      const state = { count: 0 }
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (
              node instanceof Element &&
              (node.matches('[data-id="kanban-card"]') || node.querySelector('[data-id="kanban-card"]') !== null)
            ) {
              state.count++
            }
          }
        }
      })
      observer.observe(element, { childList: true, subtree: true })
      return { state, observer }
    })
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(origin.x + origin.width / 2 + (i % 2), origin.y + origin.height / 2)
    }
    const count = await insertions.evaluate(({ state, observer }) => {
      observer.disconnect()
      return state.count
    })
    await insertions.dispose()
    expect(count).toBe(0)
    await page.mouse.up()
    await expect(page.locator('.kanban-container .drop-allowed, .kanban-container .drop-disabled')).toHaveCount(0)

    await board.holdCardVia(issueId, [{ over: board.column('doing') }, { over: queue }])
    await page.mouse.up()

    await expect(page.locator('.kanban-container .drop-allowed, .kanban-container .drop-disabled')).toHaveCount(0)
    await expect(page.locator('[data-id="kanban-drop-targets"]')).toHaveCount(0)
    await expect.poll(async () => (await board.cardIdsIn(queue)).indexOf(issueId)).toBe(originalIndex)
    await expect(board.card(issueId)).toHaveCount(1)
    expect(await client.findOne(tracker.class.Issue, { _id: issueId })).toMatchObject({
      status: issue.status,
      rank: issue.rank
    })
  })

  test('the board opens from the navigator', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    const boards = new BoardsPage(page)
    const navigation = await client.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    expect(navigation).toBeDefined()
    await client.update(navigation as BoardNavigationPreference, {
      boards: navigation?.boards.filter((id) => id !== boardId) ?? []
    })
    await boards.catalogButton().click()
    await boards.catalogRow(boardId).locator('[data-id="boardAddToNavigation"]').click()
    await expect(boards.navItems()).toContainText(`${titlePrefix}board`)
    await boards.navItems().getByText(`${titlePrefix}board`).click()
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${boardId}`))
    await expect(boards.columns().first()).toBeVisible()
  })

  test('navigator header actions keep their positions on hover and creation precedes the catalog', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.catalogButton().click()
    await expect(boards.catalog()).toBeVisible()
    for (const [createName, catalogName] of [
      ['Create board', 'All boards'],
      ['Create project', 'All projects']
    ]) {
      const headers = page.locator('.hulyNavGroup-header')
      const create = headers.getByRole('button', { name: createName, exact: true })
      const catalog = headers.getByRole('button', { name: catalogName, exact: true })
      await page.mouse.move(0, 0)
      const before = [await create.boundingBox(), await catalog.boundingBox()]
      expect(before[0]).not.toBeNull()
      expect(before[1]).not.toBeNull()
      expect(before[0]?.x).toBeLessThan(before[1]?.x ?? 0)
      await catalog.hover()
      expect([await create.boundingBox(), await catalog.boundingBox()]).toEqual(before)
    }
  })

  test('the catalog and create buttons stay keyboard accessible in collapsed and empty sections', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.catalogButton().click()
    await expect(boards.catalog()).toBeVisible()
    const header = boards.catalogButton().locator('xpath=ancestor::button[contains(@class, "hulyNavGroup-header")]')
    if ((await header.getAttribute('class'))?.includes('isOpen') === true) {
      await header.click({ position: { x: 4, y: 4 } })
    }
    await expect(header).not.toHaveClass(/isOpen/)
    await boards.catalogButton().focus()
    await page.keyboard.press('Enter')
    await expect(boards.catalog()).toBeVisible()

    const navigation = await client.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    expect(navigation).toBeDefined()
    const previous = navigation?.boards ?? []
    try {
      await client.update(navigation as BoardNavigationPreference, { boards: [] })
      await expect(boards.navItems()).toHaveCount(0)
      await expect(boards.catalogButton()).toBeVisible()
      const create = page.getByRole('button', { name: 'Create board', exact: true })
      await expect(create).toBeVisible()
      await create.focus()
      await page.keyboard.press('Enter')
      await expect(boards.createWizard()).toBeVisible()
    } finally {
      await client.update(navigation as BoardNavigationPreference, { boards: previous })
    }
  })

  test('a new global board stays in the catalog until explicitly added, and hiding keeps it open', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await expect
      .poll(
        async () =>
          await client.findOne(tracker.class.BoardNavigationPreference, {
            attachedTo: 'tracker:boards-navigation'
          })
      )
      .toBeDefined()
    const id = await makeBoard('catalog-only', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }]
    })
    await boards.catalogButton().click()
    await expect(boards.catalogRow(id)).toBeVisible()
    await expect(boards.navItem(`${titlePrefix}catalog-only`)).toHaveCount(0)
    await boards.catalog().locator('.searchInput-wrapper').click()
    await boards.catalogSearch().fill(`${titlePrefix}catalog-only`)
    await expect(boards.catalog().locator('.antiTable-body__row')).toHaveCount(1)

    await boards.open(id)
    await expect(boards.addToNavigation()).toBeVisible()
    await expect(boards.navItem(`${titlePrefix}catalog-only`)).toHaveCount(0)
    await page.reload()
    await expect(boards.addToNavigation()).toBeVisible()
    const navigation = await client.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    expect(navigation?.boards).not.toContain(id)
    await boards.addToNavigation().click()
    await expect(boards.addToNavigation()).toHaveCount(0)
    const row = boards.navItem(`${titlePrefix}catalog-only`)
    await expect(row).toBeVisible()
    await client.createDoc(tracker.class.BoardPreference, core.space.Workspace, { attachedTo: id })
    await row.hover()
    await row.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.locator('.antiPopup').getByRole('button', { name: 'Remove from my boards', exact: true }).click()
    await expect(row).toHaveCount(0)
    await expect(page).toHaveURL(boards.boardUrl(id))
    await expect(boards.columns()).toHaveCount(1)
    await expect(boards.addToNavigation()).toBeVisible()
    await expect
      .poll(async () => await client.findOne(tracker.class.BoardPreference, { attachedTo: id }))
      .toBeUndefined()
    await expect
      .poll(async () =>
        (
          await client.findOne(tracker.class.BoardNavigationPreference, {
            attachedTo: 'tracker:boards-navigation'
          })
        )?.boards.includes(id)
      )
      .toBe(false)
  })

  test('sharing copies the direct board link from the board and catalog', async ({ page, context }) => {
    const boards = new BoardsPage(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(PlatformURI).origin })
    await boards.open(boardId)
    await boards.menuButton().click()
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect
      .poll(async () => await page.evaluate(async () => await navigator.clipboard.readText()))
      .toBe(boards.boardUrl(boardId))
    await boards.catalogButton().click()
    await page.evaluate(async () => {
      await navigator.clipboard.writeText('previous clipboard value')
    })
    await boards.catalogRow(boardId).locator('[data-id="boardShare"]').click()
    await expect
      .poll(async () => await page.evaluate(async () => await navigator.clipboard.readText()))
      .toBe(boards.boardUrl(boardId))
  })

  test('task type selections in the board wizard update one condition', async ({ page }) => {
    const boards = new BoardsPage(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await boards.open(boardId)
    await page.getByRole('button', { name: 'Create board', exact: true }).click()
    await page.locator('#board-create-title').fill(`${titlePrefix}filter-draft`)
    await boards.createWizard().locator('[data-id="filterConditionsAdd"]').click()
    await page.locator('.selectPopup').getByRole('button', { name: 'Task type', exact: true }).click()
    const option = page.locator('.selectPopup .menu-item').first()
    const conditions = boards.createWizard().locator('.filter-section')
    for (const count of [1, 0, 1]) {
      await option.click()
      await expect(conditions).toContainText(`${count} state`)
      await expect(conditions).toHaveCount(1)
    }
    await page.keyboard.press('Escape')
    await boards.createNext().click()
    await boards.createWizard().getByRole('button', { name: 'Back', exact: true }).click()
    await expect(conditions).toHaveCount(1)
    await expect(conditions).toContainText('1 state')
    expect(errors).toEqual([])
  })

  test('adding columns in the board wizard reveals the horizontal scrollbar', async ({ page }) => {
    const boards = new BoardsPage(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await boards.open(boardId)
    await page.getByRole('button', { name: 'Create board', exact: true }).click()
    await page.locator('#board-create-title').fill(`${titlePrefix}columns-draft`)
    await boards.createNext().click()
    await boards.createNext().click()
    const wrapper = boards.createWizard().locator('[data-id="boardColumnsScroll"]')
    const scroll = wrapper.locator('.scroll')
    await expect(scroll).toBeVisible()
    await expect(wrapper.locator('.bar-horizontal')).toHaveCount(0)
    const unplaced = boards.createWizard().locator('[data-id="boardUnplacedStatuses"]')
    const before = await unplaced.boundingBox()
    for (let index = 0; index < 6; index++) {
      await boards.createWizard().locator('[data-id="boardAddColumn"]').click()
    }
    await page.mouse.move(0, 0)
    await expect(wrapper.locator('.bar-horizontal')).toBeVisible()
    await expect(wrapper.locator('.bar-horizontal')).toHaveCSS('opacity', '1')
    await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect.poll(async () => await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    expect(await unplaced.boundingBox()).toEqual(before)
    const last = boards.createWizard().locator('[data-id="boardColumn"]').last()
    expect((await last.boundingBox())?.y).toBeCloseTo(before?.y ?? 0, 0)
  })

  test('the board catalog is a table and settings follow author and editor rights', async ({ page, browser }) => {
    const id = await makeBoard('catalog-settings')
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.catalogButton().click()
    const table = boards.catalog().getByRole('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader')).toHaveText(['', 'Name', 'Owner', 'Visibility', 'More actions'])
    const row = boards.catalogRow(id)
    await expect(row.getByRole('cell')).toHaveCount(5)
    await expect(row.getByRole('cell').nth(2)).not.toBeEmpty()
    await row.locator('[data-id="boardCatalogSettings"]').click()
    await expect(page).toHaveURL(boards.boardUrl(id, true))
    await expect(boards.settings()).toBeVisible()

    using second = await getSecondPage(browser)
    const boards2 = new BoardsPage(second.page)
    const connection = await connectTracker(undefined, PlatformUserSecond)
    try {
      const { workspaceToken } = connection
      const editor = (
        await createRestClient(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token).getAccount()
      ).uuid
      await second.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/boards`)
      const row2 = boards2.catalogRow(id)
      await expect(row2).toBeVisible()
      await expect(row2.locator('[data-id="boardCatalogSettings"]')).toHaveCount(0)
      await expect(row2.locator('[data-id="boardShare"]')).toBeVisible()
      await client.updateDoc(tracker.class.Board, core.space.Workspace, id, { editors: [editor] })
      await row2.locator('[data-id="boardCatalogSettings"]').click()
      await expect(second.page).toHaveURL(boards2.boardUrl(id, true))
      await expect(boards2.settings()).toBeVisible()
      await boards2.catalogButton().click()
      await client.updateDoc(tracker.class.Board, core.space.Workspace, id, { editors: [] })
      await expect(row2.locator('[data-id="boardCatalogSettings"]')).toHaveCount(0)
    } finally {
      await connection.client.close()
    }
  })

  test('settings keep the selector left, usable fields at narrow width, and deletion owner only', async ({
    page,
    browser
  }) => {
    const boards = new BoardsPage(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(boards.boardUrl(boardId, true))
    await expect(boards.settingsGeneral()).toBeVisible()
    await expect(boards.settingsDelete()).toBeVisible()
    const selector = await boards.settingsSwitcher().boundingBox()
    const title = await boards.settings().locator('.hulyHeader-container .title').boundingBox()
    expect(selector).not.toBeNull()
    expect(title).not.toBeNull()
    expect((selector?.x ?? 0) + (selector?.width ?? 0)).toBeLessThanOrEqual(title?.x ?? 0)
    try {
      await page.setViewportSize({ width: 420, height: 800 })
      const input = boards.settingsGeneral().locator('#board-title')
      const description = boards.settingsGeneral().locator('#board-description')
      await expect(input).toBeVisible()
      await expect(description).toBeVisible()
      await expect.poll(async () => (await input.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(200)
      await expect.poll(async () => (await description.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(200)
      const content = boards.settings().locator('.content')
      await expect.poll(async () => (await content.boundingBox())?.height ?? 0).toBeGreaterThan(100)
      for (const control of [input, boards.settingsSwitcher(), boards.share()]) {
        await expect(control).toBeVisible()
        await expect
          .poll(
            async () => {
              const bounds = await control.boundingBox()
              return (
                bounds !== null &&
                bounds.x >= 0 &&
                bounds.y >= 0 &&
                bounds.x + bounds.width <= 420 &&
                bounds.y + bounds.height <= 800
              )
            },
            { message: control.toString() }
          )
          .toBe(true)
      }
      expect(await content.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await input.fill(`${titlePrefix}board narrow`)
      await input.blur()
      await expect.poll(async () => (await readBoard())?.title).toBe(`${titlePrefix}board narrow`)
    } finally {
      const board = await readBoard()
      if (board !== undefined) await client.update(board, { title: `${titlePrefix}board` })
      await page.setViewportSize({ width: 1440, height: 900 })
    }
    using second = await getSecondPage(browser)
    const boards2 = new BoardsPage(second.page)
    await second.page.goto(boards2.boardUrl(boardId, true))
    await expect(boards2.settings()).toBeVisible()
    await expect(boards2.settingsDelete()).toHaveCount(0)
    await expect(boards2.share()).toBeVisible()
  })

  test('closing an issue opened from a board keeps the board', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.columns().first().locator('.tracker-card').first().click()
    await expect(page.locator('#btnPClose')).toBeVisible()
    await page.locator('#btnPClose').click()
    await expect(page.locator('#btnPClose')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${boardId}$`))
    await expect(boards.columns()).toHaveCount(2)
    await expect(page.getByText('Board unavailable or deleted')).toHaveCount(0)
  })

  test('a board project the user cannot see gets its own chip', async ({ page }) => {
    const id = await makeBoard('hidden-project', {
      projects: [project?._id as Ref<Project>, generateId<Project>()],
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }]
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.unavailable()).toBeVisible()
    await expect(boards.unavailable()).toContainText('1 project unavailable')
    await boards.unavailable().hover()
    await expect(page.getByText('hidden project')).toBeVisible()
  })

  test('the board without hidden projects has no unavailable chip', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await expect(boards.menuButton()).toBeVisible()
    await expect(boards.unavailable()).toHaveCount(0)
  })

  test('card density follows the board', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await expect(boards.card('normal').first()).toBeVisible()

    const board = await readBoard()
    if (board === undefined) throw new Error('board is gone')
    await client.update(board, { density: 'dense' })
    await expect(boards.card('dense').first()).toBeVisible()
  })

  test('the board header has no view controls and no density slider', async ({ page }) => {
    const issueId = await createIssue(client, ctx, {
      title: `${titlePrefix}header-statistics`,
      status: 'Todo',
      estimation: 2
    })
    // Own board: view options are kept per board, the slider must not touch the shared one
    const id = await makeBoard('density-slider', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      density: 'normal',
      quickFilters: Array.from({ length: 26 }, (_, index) => ({
        id: `quick-${index}`,
        title: `Quick filter ${index}`,
        condition: ''
      }))
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.card('normal').first()).toBeVisible()

    // The board sets its order, fields, columns and lanes: no viewlets and no view options in its header
    await expect(page.locator('button[data-id="btn-viewOptions"]')).toHaveCount(0)
    await expect(page.locator('button[data-id="btn-viewSetting"]')).toHaveCount(0)
    await expect(page.locator('[name="viewletSelector"]')).toHaveCount(0)
    // The density slider hides behind tracker-board-next
    await expect(page.locator('[data-id="boardDensity"]')).toHaveCount(0)

    const header = page.locator('.hulyHeader-container').filter({ has: boards.menuButton() })
    const card = page.locator(`[data-id="kanban-card"][data-card-id="${issueId}"]`)
    await card.hover({ position: { x: 8, y: 8 } })
    await card.hover()
    await expect(card).toHaveClass(/selection/)
    await page.keyboard.press('x')
    await expect(card).toHaveClass(/checked/)
    const statistics = header.locator('.hulyHeader-buttonsGroup.extra')
    await expect(statistics).toHaveText('2h')
    const statisticsText = await statistics.innerText()
    const viewport = page.viewportSize()
    try {
      for (const width of [1600, 900]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(header).toHaveClass(width === 900 ? /doubleRow/ : /^(?!.*doubleRow)/)
        await expect(header.locator('.searchInput-wrapper')).toHaveCount(1)
        await expect(header.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(1)
        await expect(statistics).toBeVisible()
        await expect(statistics).toHaveText(statisticsText)
        const statisticsBounds = await statistics.boundingBox()
        const headerBounds = await header.boundingBox()
        expect(statisticsBounds).not.toBeNull()
        expect((statisticsBounds?.x ?? 0) + (statisticsBounds?.width ?? 0)).toBeLessThanOrEqual(
          (headerBounds?.x ?? 0) + (headerBounds?.width ?? 0)
        )
        if (width === 900) {
          const menu = await boards.menuButton().boundingBox()
          const search = await header.locator('.searchInput-wrapper').boundingBox()
          expect(menu).not.toBeNull()
          expect(search?.y).toBeGreaterThanOrEqual((menu?.y ?? 0) + (menu?.height ?? 0))
        }
      }
    } finally {
      if (viewport !== null) await page.setViewportSize(viewport)
    }
  })

  test('settings: a column is renamed', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)

    await boards.openSettings()
    await expect(boards.settings()).toBeVisible()
    await boards.settings().getByText('Columns', { exact: true }).click()
    await expect(boards.settingsColumns()).toBeVisible()
    const title = boards.settingsColumn().first().locator('input').first()
    await title.fill('Waiting')
    await title.blur()
    await expect.poll(async () => (await readBoard())?.columns[0].title).toBe('Waiting')

    await boards.settingsBack().click()
    await expect(boards.columns().first()).toBeVisible()
    await expect(boards.columns().first().locator('.header')).toContainText('Waiting')
  })

  test('a project kanban stays the plain kanban even when the project has a board', async ({ page }) => {
    const projectPath = encodeURIComponent(project?._id ?? '')
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await page.locator('label[data-id="tab-all"]').click()
    await page.locator(ViewletSelectors.Board).click()
    await page.locator('[data-id="kanban-column"], [data-id="kanban-swimlane"]').first().waitFor({ timeout: 15000 })
    await expect(page).not.toHaveURL(new RegExp(`/tracker/boards/${boardId}`))
  })

  test('an old project link with a board id shows the project issues', async ({ page }) => {
    const projectPath = encodeURIComponent(project?._id ?? '')
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues/${boardId}`))?.finished()
    await expect(page.locator('button[data-id="btn-viewOptions"]')).toBeVisible()
    await expect(page.locator('[data-id="boardDensity"]')).toHaveCount(0)
  })

  test('FUSIO-1683 a board is created by the wizard with one empty column and its closed warning preference', async ({
    page
  }) => {
    // Inside a project the board takes it
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${project?._id}/issues`))?.finished()
    const boards = new BoardsPage(page)
    await boards.openCreateWizard()
    await page.locator('#board-create-title').fill(`${titlePrefix}created`)
    await page.locator('#board-create-description').fill('Board made by the wizard')
    // A personal board skips the editors step; switching back restores it.
    await page.locator('[data-id="board-create-visibility-me"]').click()
    await expect(boards.createWizard().locator('.wizard__steps')).not.toContainText('Can edit')
    await boards.createNext().click()
    await expect(page.locator('[data-id="board-create-step-columns"]')).toBeVisible()
    await expect(page.locator('[data-id="boardColumnHidden"]')).toContainText(
      'This column is hidden on the board until a status is added'
    )
    await expect(page.locator('[data-id="board-create-editors"]')).toHaveCount(0)
    await boards.createFooter().getByRole('button', { name: 'Back', exact: true }).click()
    await page.locator('[data-id="board-create-visibility-me"]').click()
    // A team board: the editors step, then the columns
    await boards.createNext().click()
    await expect(page.locator('[data-id="board-create-editors"]')).toBeVisible()
    await boards.createNext().click()
    await expect(page.locator('[data-id="boardStatus"]').first()).toBeVisible()
    const closedWarning = page.locator('input[data-id="boardWarnOnClosedStatuses"]')
    await expect(closedWarning).not.toBeChecked()
    await closedWarning.setChecked(true)
    const uniqueTitles = page.locator('input[data-id="boardPreventDuplicateColumnTitles"]')
    await expect(uniqueTitles).not.toBeChecked()
    await uniqueTitles.setChecked(true)
    await boards.createSubmit().click()
    await expect(page).toHaveURL(/\/tracker\/boards\/[^/]+$/)

    const created = new URL(page.url()).pathname.split('/')[5] as Ref<Board>
    await expect.poll(async () => (await readBoardById(created))?.description).toBe('Board made by the wizard')
    const board = await readBoardById(created)
    expect(board?.projects).toEqual([project?._id])
    expect(board?.warnOnClosedStatuses).toBe(true)
    expect(board?.preventDuplicateColumnTitles).toBe(true)
    // The statuses wait in "Statuses without a column" until the user drags them
    expect(board?.columns.map((c) => [c.title, c.statuses])).toEqual([['My column', []]])
    await expect(boards.columns()).toHaveCount(0)
  })

  // The card tab hides behind tracker-board-next
  test.skip('card fields: a field is hidden on the board cards and the preview, and comes back when checked', async ({
    page
  }) => {
    const title = `${titlePrefix}rich`
    // A closed status keeps the card away from the columns of the other tests
    await createIssue(client, ctx, {
      title,
      status: 'Cancelled',
      priority: IssuePriority.High,
      dueDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
      estimation: 120
    })
    const id = await makeBoard('cards', {
      columns: [
        { id: 'closed', title: 'Closed', category: task.statusCategory.Lost, statuses: [statusId('Cancelled')] }
      ]
    })
    const boards = new BoardsPage(page)
    const visibleFields = async (): Promise<CardField[] | undefined> => (await readBoardById(id))?.cardFields
    const richCard = boards.card('normal').filter({ hasText: title })

    await (await page.goto(boards.boardUrl(id, true, 'card')))?.finished()
    await expect(boards.settingsCard()).toBeVisible()
    // A board without the setting shows every field, the detailed preview too
    for (const field of cardFields) {
      await expect(boards.cardFieldMark(boards.preview('detailed'), field), field).toHaveCount(1)
    }

    await boards.cardFieldLabel('priority').click()
    await expect.poll(async () => (await visibleFields())?.includes('priority')).toBe(false)
    await boards.cardFieldLabel('dueDate').click()
    await expect.poll(async () => (await visibleFields())?.includes('dueDate')).toBe(false)
    expect(await visibleFields()).toHaveLength(cardFields.length - 2)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'priority')).toHaveCount(0)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'dueDate')).toHaveCount(0)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'estimation')).toHaveCount(1)

    await boards.settingsBack().click()
    await expect(richCard).toBeVisible()
    await expect(boards.cardFieldMark(richCard, 'priority')).toHaveCount(0)
    await expect(boards.cardFieldMark(richCard, 'dueDate')).toHaveCount(0)
    await expect(boards.cardFieldMark(richCard, 'estimation')).toHaveCount(1)

    await boards.openSettings()
    await boards.settings().getByText('Card', { exact: true }).click()
    await boards.cardFieldLabel('priority').click()
    await expect.poll(async () => (await visibleFields())?.includes('priority')).toBe(true)
    await boards.cardFieldLabel('dueDate').click()
    await expect.poll(async () => (await visibleFields())?.length).toBe(cardFields.length)
    await boards.settingsBack().click()
    await expect(boards.cardFieldMark(richCard, 'priority')).toHaveCount(1)
    await expect(boards.cardFieldMark(richCard, 'dueDate')).toHaveCount(1)
  })

  test('swimlanes "None" is kept after a reload', async ({ page }) => {
    const id = await makeBoard('lanes', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      swimlanes: [
        { id: 'first', title: 'First', condition: '' },
        { id: 'rest', title: 'Others', condition: '' }
      ]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'swimlanes')))?.finished()
    await expect(boards.settingsTab('swimlanes')).toBeVisible()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(1)

    await boards.radio('boardSwimlanesNone').click()
    await page.locator('.popup').getByRole('button', { name: 'Ok', exact: true }).click()
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    await expect.poll(async () => (await readBoardById(id))?.swimlanes.length).toBe(0)

    await page.reload()
    await expect(boards.settingsTab('swimlanes')).toBeVisible()
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    // Lanes by filters hide behind tracker-board-next once the board has none
    await expect(boards.radioInput('boardSwimlanesByFilters')).toHaveCount(0)
    await expect(boards.swimlaneRules()).toHaveCount(0)

    await boards.open(id)
    await expect(boards.swimlanes()).toHaveCount(0)
  })

  test('swimlanes "None" stays unchecked when the confirmation is cancelled', async ({ page }) => {
    const id = await makeBoard('lanes-cancel', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      swimlanes: [
        { id: 'first', title: 'First', condition: '' },
        { id: 'rest', title: 'Others', condition: '' }
      ]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'swimlanes')))?.finished()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()

    await boards.radio('boardSwimlanesNone').click()
    await page.locator('.popup').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()
    await expect(boards.radioInput('boardSwimlanesNone')).not.toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(1)
    expect((await readBoardById(id))?.swimlanes).toHaveLength(2)
  })

  test('swimlanes by a field replace the lanes by filters, which then hide', async ({ page }) => {
    const id = await makeBoard('lanes-field', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      swimlanes: [
        { id: 'first', title: 'First', condition: '' },
        { id: 'rest', title: 'Others', condition: '' }
      ]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'swimlanes')))?.finished()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()

    await boards.radio('boardSwimlanesByField').click()
    await page.locator('.popup').getByRole('button', { name: 'Ok', exact: true }).click()
    await expect(boards.radioInput('boardSwimlanesByField')).toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(0)
    await expect.poll(async () => (await readBoardById(id))?.swimLaneBy).toBe('assignee')
    expect((await readBoardById(id))?.swimlanes).toHaveLength(0)

    await page.locator('[data-id="boardSwimlanesField"]').click()
    await boards.menuItem('Priority').click()
    await expect.poll(async () => (await readBoardById(id))?.swimLaneBy).toBe('priority')

    await page.reload()
    await expect(boards.radioInput('boardSwimlanesByField')).toBeChecked()
    // Lanes by filters hide behind tracker-board-next once the board has none
    await expect(boards.radio('boardSwimlanesByFilters')).toHaveCount(0)

    await boards.radio('boardSwimlanesNone').click()
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    await expect.poll(async () => (await readBoardById(id))?.swimLaneBy).toBeNull()
    // The saved board does not take the check away; the field picker stays, disabled
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    await expect(page.locator('[data-id="boardSwimlanesField"]')).toBeDisabled()

    await boards.radio('boardSwimlanesByField').click()
    await expect.poll(async () => (await readBoardById(id))?.swimLaneBy).toBe('assignee')
    await expect(boards.radioInput('boardSwimlanesByField')).toBeChecked()
    await expect(page.locator('[data-id="boardSwimlanesField"]')).toBeEnabled()
  })

  test('full screen hides the side panels and brings them back', async ({ page }) => {
    const id = await makeBoard('fullscreen', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }]
    })
    const boards = new BoardsPage(page)
    // The apps panel on the left; the right sidebar is an antiPanel-application too
    const apps = page.locator('.antiPanel-application:not(.sidebar-container)')
    await boards.open(id)
    await expect(page.locator('.antiPanel-navigator')).toBeVisible()

    await boards.fullscreenButton().click()
    await expect(page.locator('.antiPanel-navigator')).toHaveCount(0)
    await expect(apps).toBeHidden()
    await expect(boards.columns().first()).toBeVisible()

    // A task opened in the sidebar from the full screen board keeps the sidebar shown
    await boards.card('normal').first().locator('a').first().click()
    await page.locator('[data-id="btnOpenInSidebar"]').click()
    await page.goBack()
    await expect(boards.columns().first()).toBeVisible()
    await expect(page.locator('#sidebar')).toBeVisible()
    await expect(apps).toBeHidden()

    // Re-enter with the same tab already expanded, then explicitly reopen it with Space.
    await boards.fullscreenButton().click()
    await expect(page.locator('#sidebar')).toBeVisible()
    await boards.fullscreenButton().click()
    await expect(page.locator('#sidebar')).toBeHidden()
    await boards.fullscreenButton().evaluate((element: HTMLButtonElement) => {
      element.blur()
    })
    await boards.card('normal').first().hover()
    await page.keyboard.press('Space')
    await expect(boards.fullscreenButton()).toHaveAttribute('aria-label', 'Exit full screen')
    await expect(page.locator('#sidebar')).toBeVisible()
    await expect(apps).toBeHidden()

    await boards.fullscreenButton().click()
    await expect(page.locator('.antiPanel-navigator')).toBeVisible()
    await expect(apps).toBeVisible()
  })

  test.skip('card field clicks in a row are all kept', async ({ page }) => {
    const id = await makeBoard('fast-clicks')
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'card')))?.finished()
    await expect(boards.settingsCard()).toBeVisible()
    // No wait between the clicks: each one must build on the previous change
    await boards.cardFieldLabel('priority').click()
    await boards.cardFieldLabel('dueDate').click()
    await boards.cardFieldLabel('labels').click()
    await expect
      .poll(async () => (await readBoardById(id))?.cardFields)
      .toEqual(cardFields.filter((f) => !['priority', 'dueDate', 'labels'].includes(f)))
  })

  test('a board of another user leaves the navigator when it becomes personal', async ({ page, browser }) => {
    const id = await makeBoard('nav-visibility')
    const secondConnection = await connectTracker(undefined, PlatformUserSecond)
    const secondClient = secondConnection.client
    const previous = await secondClient.findOne(tracker.class.BoardNavigationPreference, {
      attachedTo: 'tracker:boards-navigation'
    })
    using second = await getSecondPage(browser)
    const boards = new BoardsPage(page)
    const boards2 = new BoardsPage(second.page)
    try {
      await second.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/boards`)
      await boards2.catalogRow(id).locator('[data-id="boardAddToNavigation"]').click()
      await expect(boards2.navItems()).toContainText(`${titlePrefix}nav-visibility`)

      await page.goto(boards.boardUrl(id, true, 'members'))
      await boards.personalToggle().setChecked(true)
      await expect(boards2.navItem(`${titlePrefix}nav-visibility`)).toHaveCount(0)
      await expect(boards2.catalogRow(id)).toHaveCount(0)
      await second.page.goto(boards2.boardUrl(id))
      await expect(second.page.getByText('Board unavailable or deleted', { exact: true })).toBeVisible()
    } finally {
      const navigation = await secondClient.findOne(tracker.class.BoardNavigationPreference, {
        attachedTo: 'tracker:boards-navigation'
      })
      if (navigation !== undefined) {
        if (previous === undefined) await secondClient.remove(navigation)
        else await secondClient.update(navigation, { boards: previous.boards })
      }
    }
  })

  test('a quick filter narrows the cards and a second click takes it off', async ({ page }) => {
    const id = await makeBoard('quick', {
      columns: [
        {
          id: 'queue',
          title: 'Queue',
          category: task.statusCategory.ToDo,
          statuses: [statusId('Backlog'), statusId('Todo')]
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ],
      quickFilters: [{ id: 'todo', title: 'Todo only', condition: statusCondition(statusId('Todo')) }]
    })
    const boards = new BoardsPage(page)
    const card = (name: string): Locator => boards.card('normal').filter({ hasText: `${titlePrefix}${name}` })
    await boards.open(id)
    await expect(card('backlog')).toBeVisible()
    await expect(card('todo')).toBeVisible()
    await expect(card('doing')).toBeVisible()

    await boards.quickFilter('Todo only').click()
    await expect(boards.quickFilter('Todo only')).toHaveAttribute('aria-pressed', 'true')
    await expect(card('todo')).toBeVisible()
    await expect(card('backlog')).toHaveCount(0)
    await expect(card('doing')).toHaveCount(0)

    await boards.quickFilter('Todo only').click()
    await expect(boards.quickFilter('Todo only')).toHaveAttribute('aria-pressed', 'false')
    await expect(card('backlog')).toBeVisible()
    await expect(card('doing')).toBeVisible()
  })

  test('duplicate column titles are optional and rejected before saving when restricted', async ({ page }) => {
    const id = await makeBoard('unique-column-titles', {
      columns: [
        { id: 'a', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] },
        { id: 'b', title: 'Doing', category: task.statusCategory.Active, statuses: [] }
      ]
    })
    const boards = new BoardsPage(page)
    await page.goto(boards.boardUrl(id, true, 'columns'))
    const toggle = page.locator('input[data-id="boardPreventDuplicateColumnTitles"]')
    const secondTitle = boards.settingsColumn().nth(1).locator('input.name')
    const errors = page.locator('[data-id="boardColumnTitleError"]')
    await expect(toggle).not.toBeChecked()
    await secondTitle.fill(' queue ')
    await secondTitle.blur()
    await expect.poll(async () => (await readBoardById(id))?.columns[1].title).toBe('queue')
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await expect(errors).toHaveCount(2)
    await expect(page.getByText('Rename columns with duplicate titles to enable this restriction')).toBeVisible()
    expect((await readBoardById(id))?.preventDuplicateColumnTitles).not.toBe(true)

    await secondTitle.fill('Doing')
    await secondTitle.blur()
    await expect.poll(async () => (await readBoardById(id))?.columns[1].title).toBe('Doing')
    await toggle.setChecked(true)
    await expect.poll(async () => (await readBoardById(id))?.preventDuplicateColumnTitles).toBe(true)
    await secondTitle.fill(' QUEUE ')
    await secondTitle.blur()
    await expect(errors).toHaveCount(1)
    await expect(secondTitle).toHaveAttribute('aria-invalid', 'true')
    expect((await readBoardById(id))?.columns[1].title).toBe('Doing')
    await secondTitle.press('Escape')
    await expect(secondTitle).toHaveValue('Doing')
    await expect(errors).toHaveCount(0)

    const add = page.locator('[data-id="boardAddColumn"]')
    await add.click()
    await expect(boards.settingsColumn()).toHaveCount(3)
    await add.click()
    await expect(boards.settingsColumn()).toHaveCount(4)
    await expect
      .poll(async () => (await readBoardById(id))?.columns.map((column) => column.title))
      .toEqual(['Queue', 'Doing', 'New column', 'New column 2'])
    await page.reload()
    await expect(toggle).toBeChecked()
    await toggle.setChecked(false)
    await expect.poll(async () => (await readBoardById(id))?.preventDuplicateColumnTitles).toBe(false)
    await secondTitle.fill('Queue')
    await secondTitle.blur()
    await expect.poll(async () => (await readBoardById(id))?.columns[1].title).toBe('Queue')
    await expect(errors).toHaveCount(0)
  })

  test('FUSIO-1683 an empty column title restores the saved value after blur', async ({ page }) => {
    const id = await makeBoard('restore-column-title', {
      columns: [{ id: 'queue', title: 'Saved queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }]
    })
    const boards = new BoardsPage(page)
    await page.goto(boards.boardUrl(id, true, 'columns'))
    const input = boards.settingsColumn().locator('input.name')
    await expect(input).toHaveValue('Saved queue')
    await input.fill('   ')
    await input.blur()
    await expect(input).toHaveValue('Saved queue')
    await expect(input).not.toHaveAttribute('placeholder')
    expect(await input.evaluate((element) => element.matches(':placeholder-shown'))).toBe(false)
    expect((await readBoardById(id))?.columns[0].title).toBe('Saved queue')
    await page.reload()
    await expect(input).toHaveValue('Saved queue')
  })

  test('FUSIO-1683 closed status warnings are optional and persist without moving statuses', async ({ page }) => {
    await createIssue(client, ctx, { title: `${titlePrefix}closed-warning-done`, status: 'Done' })
    await createIssue(client, ctx, { title: `${titlePrefix}closed-warning-cancelled`, status: 'Cancelled' })
    const taskTypes = await client.findAll(task.class.TaskType, { parent: ctx.project.type })
    const statuses = await client.findAll(tracker.class.IssueStatus, {
      _id: { $in: taskTypes.flatMap((type) => type.statuses) }
    })
    const closed = statuses.filter(
      (status) => status.category === task.statusCategory.Won || status.category === task.statusCategory.Lost
    )
    const columns = [
      {
        id: 'open',
        title: 'Open',
        category: task.statusCategory.Active,
        statuses: statuses.filter((status) => !closed.includes(status)).map((status) => status._id)
      }
    ]
    const id = await makeBoard('closed-warning', { columns })
    const hidden = await client.findAll(tracker.class.Issue, {
      space: project?._id,
      status: { $in: closed.map((status) => status._id) }
    })
    expect(hidden.length).toBeGreaterThanOrEqual(2)
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.uncovered()).toHaveCount(0)
    expect((await readBoardById(id))?.warnOnClosedStatuses).toBeUndefined()

    await page.goto(boards.boardUrl(id, true, 'columns'))
    const toggle = page.locator('input[data-id="boardWarnOnClosedStatuses"]')
    await expect(toggle).not.toBeChecked()
    await toggle.setChecked(true)
    await expect.poll(async () => (await readBoardById(id))?.warnOnClosedStatuses).toBe(true)
    await page.reload()
    await expect(toggle).toBeChecked()
    expect((await readBoardById(id))?.columns).toEqual(columns)
    await boards.open(id)
    await expect(boards.uncovered()).toContainText(`${closed.length} statuses without a column`)
    await expect(boards.uncovered()).toContainText(`${hidden.length} issues are not visible`)
    await boards.uncovered().click()
    const rows = boards.uncoveredPopup().locator('.status')
    await expect(rows).toHaveCount(closed.length)
    for (const status of closed) {
      await expect(rows.filter({ hasText: status.name }).locator('.count')).toHaveText(
        String(hidden.filter((issue) => issue.status === status._id).length)
      )
    }

    await page.goto(boards.boardUrl(id, true, 'columns'))
    await toggle.setChecked(false)
    await expect.poll(async () => (await readBoardById(id))?.warnOnClosedStatuses).toBe(false)
    await page.reload()
    await expect(toggle).not.toBeChecked()
    expect((await readBoardById(id))?.columns).toEqual(columns)
    await boards.open(id)
    await expect(boards.uncovered()).toHaveCount(0)
  })

  test('statuses without a column raise a warning with a popup that leads on', async ({ page }) => {
    const id = await makeBoard('uncovered', {
      columns: [
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ]
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.uncovered()).toBeVisible()
    await expect(boards.uncovered()).toContainText('without a column')
    await expect(boards.uncovered()).toHaveAccessibleName(/without a column/)
    await page.mouse.move(0, 0)
    await expect.poll(async () => (await boards.uncovered().boundingBox())?.width ?? 0).toBeLessThanOrEqual(32)
    const collapsedWidth = (await boards.uncovered().boundingBox())?.width ?? 0
    await boards.uncovered().hover()
    await expect
      .poll(async () => (await boards.uncovered().boundingBox())?.width ?? 0)
      .toBeGreaterThan(collapsedWidth + 100)
    await expect
      .poll(
        async () =>
          await boards
            .uncovered()
            .locator('.uncovered-label > span')
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      )
      .toBe(true)
    expect(
      await boards.uncovered().evaluate((el) => {
        const bounds = el.getBoundingClientRect()
        const header = el.closest('.hulyHeader-container')?.getBoundingClientRect()
        return header !== undefined && bounds.left >= header.left && bounds.right <= header.right
      })
    ).toBe(true)
    await page.mouse.move(0, 0)
    await expect.poll(async () => (await boards.uncovered().boundingBox())?.width ?? 0).toBe(collapsedWidth)
    await boards.uncovered().focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(boards.uncovered()).toBeFocused()
    await expect
      .poll(async () => (await boards.uncovered().boundingBox())?.width ?? 0)
      .toBeGreaterThan(collapsedWidth + 100)

    await boards.uncovered().click()
    await expect(boards.uncoveredPopup()).toBeVisible()
    await expect(boards.uncoveredPopup()).toContainText('Backlog')
    await expect(boards.uncoveredPopup()).toContainText('Todo')

    // The author may add the status to a column: the columns tab opens
    await boards.uncoveredAdd().click()
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${id}/settings\\?tab=columns`))
    await expect(boards.settingsColumns()).toBeVisible()

    // The other way out lists the issues in the statuses the board misses
    await boards.open(id)
    await boards.uncovered().click()
    await boards.uncoveredShow().click()
    await expect(page).toHaveURL(/\/tracker\/all-issues$/)
    await expect(page.getByText(`${titlePrefix}todo`).first()).toBeVisible()
    await expect(page.getByText(`${titlePrefix}backlog`).first()).toBeVisible()
    await expect(page.getByText(`${titlePrefix}doing`)).toHaveCount(0)
  })

  test('a personal board disappears for another user and comes back with the team visibility', async ({
    page,
    browser
  }) => {
    const id = await makeBoard('visibility', {
      columns: [
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ]
    })
    const boards = new BoardsPage(page)
    using second = await getSecondPage(browser)
    const boards2 = new BoardsPage(second.page)
    await boards2.open(id)

    await (await page.goto(boards.boardUrl(id, true, 'members')))?.finished()
    await boards.personalToggle().setChecked(true)
    await expect.poll(async () => (await readBoardById(id))?.visibility).toBe('me')
    // The viewer lives on: the board leaves the page of the second user without a reload
    await expect(boards2.columns()).toHaveCount(0)
    await expect(second.page.getByText('Board unavailable or deleted')).toBeVisible()

    await boards.catalogButton().click()
    await expect(boards.catalogRow(id).locator('[data-id="boardPersonal"]')).toHaveText('Personal board')
    await page.goto(boards.boardUrl(id, true, 'members'))

    await boards.personalToggle().setChecked(false)
    await expect.poll(async () => (await readBoardById(id))?.visibility).toBe('all')
    // BoardMiddleware tells every session to reload boards: the board comes back without a reload
    await expect(boards2.columns().first()).toBeVisible({ timeout: 15000 })
  })

  test('the board filter does not offer the project as a condition', async ({ page }) => {
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(boardId, true)))?.finished()
    await expect(boards.settingsGeneral()).toBeVisible()
    await boards.filterAdd().click()
    await expect(boards.popupItem('Status')).toBeVisible()
    await expect(boards.popupItem('Priority')).toBeVisible()
    await expect(boards.popupItem('Project')).toHaveCount(0)
  })

  test('the settings open on the tab of the link', async ({ page }) => {
    const boards = new BoardsPage(page)
    const tabs: Array<[string, () => Locator]> = [
      ['columns', boards.settingsColumns],
      ['swimlanes', () => boards.settingsTab('swimlanes')],
      ['quickFilters', () => boards.settingsTab('quickFilters')],
      ['colorRules', () => boards.settingsTab('colorRules')]
    ]
    for (const [tab, locator] of tabs) {
      await (await page.goto(boards.boardUrl(boardId, true, tab)))?.finished()
      await expect(locator(), tab).toBeVisible()
      await expect(boards.settingsGeneral(), tab).toHaveCount(0)
    }

    // A tab nobody knows gives the first one
    await (await page.goto(boards.boardUrl(boardId, true, 'nonsense')))?.finished()
    await expect(boards.settingsGeneral()).toBeVisible()
  })
})
