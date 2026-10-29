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
import core, { generateId, type AccountUuid, type Data, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, {
  cardFields,
  IssuePriority,
  type Board,
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
  type ProjectContext
} from '../API/TrackerApi'
import { BoardsPage } from '../model/tracker/boards-page'
import { KanbanBoardPage } from '../model/tracker/kanban-board-page'
import { getSecondPage, PlatformSetting, PlatformURI } from '../utils'
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

  const statusId = (name: 'Backlog' | 'Todo' | 'In Progress' | 'Cancelled'): Ref<IssueStatus> =>
    ctx.statuses.get(name) as Ref<IssueStatus>

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
    const spots = page.locator('[data-id="kanban-drop-targets"] [data-drop-target]')
    await board.holdCardVia(doing, [
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
    const issue = await client.findOne(tracker.class.Issue, { _id: id })
    expect(issue?.status).toBe(statusId('Todo'))
  })

  test('the board opens from the navigator', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    const boards = new BoardsPage(page)
    await expect(boards.navItems()).toContainText(`${titlePrefix}board`)
    await boards.navItems().getByText(`${titlePrefix}board`).click()
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${boardId}`))
    await expect(boards.columns().first()).toBeVisible()
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
    await expect(page.getByText('Board not found')).toHaveCount(0)
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
    // Own board: view options are kept per board, the slider must not touch the shared one
    const id = await makeBoard('density-slider', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      density: 'normal'
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

  test('a board is created by the wizard with one empty column of the current project and opens', async ({ page }) => {
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
    await expect(page.locator('[data-id="board-create-editors"]')).toHaveCount(0)
    await boards.createFooter().getByRole('button', { name: 'Back', exact: true }).click()
    await page.locator('[data-id="board-create-visibility-all"]').click()
    // A team board: the editors step, then the columns
    await boards.createNext().click()
    await expect(page.locator('[data-id="board-create-editors"]')).toBeVisible()
    await boards.createNext().click()
    await expect(page.locator('[data-id="boardStatus"]').first()).toBeVisible()
    await boards.createSubmit().click()
    await expect(page).toHaveURL(/\/tracker\/boards\/[^/]+$/)

    const created = new URL(page.url()).pathname.split('/')[5] as Ref<Board>
    await expect.poll(async () => (await readBoardById(created))?.description).toBe('Board made by the wizard')
    const board = await readBoardById(created)
    expect(board?.projects).toEqual([project?._id])
    // The statuses wait in "Statuses without a column" until the user drags them
    expect(board?.columns.map((c) => [c.title, c.statuses])).toEqual([['My column', []]])
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

  // Goes through the navigator section "Boards": needs the build with the fixed navigator model
  test('a board of another user leaves the navigator when it becomes personal', async ({ page, browser }) => {
    const id = await makeBoard('nav-visibility')
    using second = await getSecondPage(browser)
    const boards = new BoardsPage(page)
    const boards2 = new BoardsPage(second.page)
    await (await second.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    await expect(boards2.navItems()).toContainText(`${titlePrefix}nav-visibility`)

    await (await page.goto(boards.boardUrl(id, true, 'members')))?.finished()
    await boards.radio('boardVisibilityMe').click()
    await expect(boards2.navItems()).not.toContainText(`${titlePrefix}nav-visibility`)
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
    await boards.radio('boardVisibilityMe').click()
    await expect.poll(async () => (await readBoardById(id))?.visibility).toBe('me')
    // The viewer lives on: the board leaves the page of the second user without a reload
    await expect(boards2.columns()).toHaveCount(0)
    await expect(second.page.getByText('Board not found')).toBeVisible()

    await boards.radio('boardVisibilityAll').click()
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
