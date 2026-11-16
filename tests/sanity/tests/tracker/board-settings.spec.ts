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

import { createRestClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import core, { generateId, type AccountUuid, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { cardDensities, type Board, type IssueStatus, type Project } from '@hcengineering/tracker'
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
import { PlatformSetting } from '../utils'

test.use({ storageState: PlatformSetting })

// Settings of a board on Second Project: the boards of boards.spec.ts live there too, own prefix keeps them apart
test.describe('board settings', () => {
  test.describe.configure({ mode: 'serial' })

  let client: TxOperations
  let ctx: ProjectContext
  let project: Project | undefined
  let boardId: Ref<Board>
  const titlePrefix = `board-settings-spec-${generateId()}-`

  const statusId = (name: 'Backlog' | 'In Progress' | 'Cancelled'): Ref<IssueStatus> =>
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
    const { workspaceToken } = conn
    const author = (
      await createRestClient(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token).getAccount()
    ).uuid as AccountUuid
    project = await findProjectByName(client, 'Second Project')
    if (project === undefined) return
    ctx = await getProjectContext(client, project._id)
    await createIssue(client, ctx, { title: `${titlePrefix}backlog`, status: 'Backlog' })
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
          statuses: [statusId('Backlog')],
          limit: 5
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ],
      swimlanes: [
        { id: 'lane-doing', title: 'In work', condition: statusCondition(statusId('In Progress')) },
        { id: 'lane-rest', title: 'The rest', condition: '' }
      ],
      quickFilters: [{ id: 'qf', title: 'Doing only', condition: statusCondition(statusId('In Progress')) }],
      // The third rule fits no issue: the example says so
      colorRules: [
        { id: 'rule-doing', color: 3, condition: statusCondition(statusId('In Progress')) },
        { id: 'rule-backlog', color: 5, condition: statusCondition(statusId('Backlog')) },
        { id: 'rule-cancelled', color: 7, condition: statusCondition(statusId('Cancelled')) }
      ],
      density: 'normal'
    })
  })

  test.beforeEach(() => {
    test.skip(project === undefined, 'Second Project not seeded')
  })

  test.afterAll(async () => {
    if (client === undefined) return
    for (const board of await client.findAll(tracker.class.Board, {})) {
      if (board.title.startsWith(titlePrefix)) await client.remove(board)
    }
    await deleteIssuesByTitlePrefix(client, titlePrefix)
  })

  const openTab = async (boards: BoardsPage, tab: string): Promise<void> => {
    await (await boards.page.goto(boards.boardUrl(boardId, true, tab)))?.finished()
    await expect(boards.settings()).toBeVisible()
  }

  test('columns without statuses stay editable but are hidden on the board', async ({ page }) => {
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const columns = [
      { id: 'empty', title: 'No statuses', category: task.statusCategory.ToDo, statuses: [] },
      { id: 'doing', title: 'Has status', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
    ]
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}empty-column`,
      filter: statusCondition(statusId('Backlog')),
      columns,
      swimlanes: []
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.columns()).toHaveCount(1)
    await expect(boards.columns().first().locator('.header')).toContainText('Has status')
    await expect(boards.columns().locator('[data-id="kanban-card"]')).toHaveCount(0)

    const saved = await client.findOne(tracker.class.Board, { _id: id })
    if (saved === undefined) throw new Error('no board')
    await client.update(saved, {
      columns: [{ ...columns[0], statuses: [statusId('Cancelled')] }, columns[1]]
    })
    await expect(boards.columns()).toHaveCount(2)
    await expect(boards.columns().first().locator('.header')).toContainText('No statuses')
    await expect(boards.columns().locator('[data-id="kanban-card"]')).toHaveCount(0)
    await client.update(saved, { columns })
    await expect(boards.columns()).toHaveCount(1)
    await expect(boards.columns().first().locator('.header')).toContainText('Has status')

    await (await page.goto(boards.boardUrl(id, true, 'columns')))?.finished()
    await expect(boards.settingsColumn()).toHaveCount(2)
    await expect(boards.settingsColumn().first().locator('input.name')).toHaveValue('No statuses')
    await expect(page.locator('[data-id="boardColumnHidden"]')).toHaveCount(1)
    await expect(boards.settingsColumn().first()).toContainText(
      'This column is hidden on the board until a status is added'
    )
    expect((await client.findOne(tracker.class.Board, { _id: id }))?.columns).toEqual(columns)
  })

  test('adding a settings column reveals and focuses it while unplaced statuses stay fixed', async ({ page }) => {
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}columns-scroll`,
      columns: [
        ...board.columns,
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `empty-${index}`,
          title: `Empty ${index}`,
          category: task.statusCategory.ToDo,
          statuses: []
        }))
      ]
    })
    const boards = new BoardsPage(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(boards.boardUrl(id, true, 'columns'))
    const unplaced = page.locator('[data-id="boardUnplacedStatuses"]')
    await expect(unplaced).toBeVisible()
    const before = await unplaced.boundingBox()
    const scroll = page.locator('[data-id="boardColumnsScroll"] .scroll')
    await expect.poll(async () => await scroll.evaluate((element) => element.scrollLeft)).toBe(0)
    await page.locator('[data-id="boardAddColumn"]').click()
    await expect(boards.settingsColumn()).toHaveCount(9)
    const last = boards.settingsColumn().last()
    const name = last.locator('input.name')
    await expect(name).toBeFocused()
    await boards.expectColumnRevealed(last)
    expect(
      await name.evaluate((input: HTMLInputElement) => (input.selectionEnd ?? 0) - (input.selectionStart ?? 0))
    ).toBe((await name.inputValue()).length)
    await name.pressSequentially('Review')
    await name.press('Tab')
    await expect
      .poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.columns.at(-1)?.title)
      .toBe('Review')
    await expect.poll(async () => await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    expect(await unplaced.boundingBox()).toEqual(before)
    await expect(last).toBeInViewport()
    expect((await last.boundingBox())?.y).toBeCloseTo(before?.y ?? 0, 0)
    await page.mouse.move(0, 0)
    const bar = page.locator('[data-id="boardColumnsScroll"] .bar-horizontal')
    await expect(bar).toBeVisible()
    await expect(bar).toHaveCSS('opacity', '1')
    await last.scrollIntoViewIfNeeded()
    await unplaced.locator('[data-id="boardStatus"]', { hasText: 'Canceled' }).dragTo(last, {
      targetPosition: { x: 100, y: 30 }
    })
    await expect
      .poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.columns.at(-1)?.statuses)
      .toContain(statusId('Cancelled'))

    // Another user's addition must not move this editor or take its keyboard focus.
    const firstName = boards.settingsColumn().first().locator('input.name')
    await firstName.focus()
    const scrollLeft = await scroll.evaluate((element) => element.scrollLeft)
    const current = await client.findOne(tracker.class.Board, { _id: id })
    if (current === undefined) throw new Error('no board')
    await client.update(current, {
      columns: [
        ...current.columns,
        { id: 'remote', title: 'Remote column', category: task.statusCategory.ToDo, statuses: [] }
      ]
    })
    await expect(boards.settingsColumn()).toHaveCount(10)
    await expect(firstName).toBeFocused()
    expect(await scroll.evaluate((element) => element.scrollLeft)).toBe(scrollLeft)
  })

  test('the personal board toggle shows its label and hint and saves visibility', async ({ page }) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'general')
    await expect(boards.personalToggle()).toHaveCount(0)
    await expect(page.locator('[data-id="boardEditors"]')).toHaveCount(0)
    await page.locator('[data-id="boardSettingsTab-members"]').click()
    await expect(boards.personalToggle()).not.toBeChecked()
    await expect(page.locator('[data-id="boardSettingsMembers"]')).toContainText('Personal board')
    await expect(page.locator('[data-id="boardSettingsMembers"]')).toContainText('A personal board, only you see it')
    await expect(page.locator('[data-id="boardSettingsMembers"]')).not.toContainText('All project members')
    await boards.personalToggle().check()
    await expect(boards.personalToggle()).toBeChecked()
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: boardId }))?.visibility).toBe('me')
    await boards.personalToggle().uncheck()
    await expect(boards.personalToggle()).not.toBeChecked()
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: boardId }))?.visibility).toBe('all')
  })

  test('a project picked in the popup shows at once, without reopening the settings', async ({ page }) => {
    // Own board: the shared one keeps a single project for the other tests
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}projects`
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'general')))?.finished()
    const chips = page.locator('[data-id="boardProjects"] .chip')
    await expect(chips).toHaveCount(1)

    await page.locator('[data-id="boardAddProject"]').click()
    await page.locator('.popup .menu-item', { hasText: 'Default' }).click()
    await expect(chips).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.projects.length).toBe(2)
  })

  test('an editor is removed from the editors table', async ({ page }) => {
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const others = (await client.findAll(contact.mixin.Employee, { active: true }))
      .map((e) => e.personUuid as AccountUuid | undefined)
      .filter((a): a is AccountUuid => a !== undefined && a !== board.author)
    test.skip(others.length === 0, 'no second employee seeded')
    // Own board: the shared one keeps no editors for the other tests
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}editors`,
      editors: [others[0]]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'general')))?.finished()
    await page.locator('[data-id="boardSettingsTab-members"]').click()
    const rows = page.locator('[data-id="boardEditors"] [data-id="project-settings-member"]')
    // The author row and the editor row
    await expect(rows).toHaveCount(2)
    await expect(rows.first().locator('[data-id="project-member-menu"]')).toHaveCount(0)
    await expect(rows.first()).toContainText('Owner')
    await expect(rows.nth(1)).toContainText('Editor')
    await boards.personalToggle().check()
    await expect(boards.personalToggle()).toBeChecked()
    await expect(page.locator('[data-id="boardEditors"]')).toHaveCount(0)
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.visibility).toBe('me')
    await boards.personalToggle().uncheck()
    await expect(boards.personalToggle()).not.toBeChecked()
    await expect(rows).toHaveCount(2)
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.visibility).toBe('all')
    await rows.nth(1).locator('[data-id="project-member-menu"]').click()
    await page.locator('.antiPopup .ap-menuItem', { hasText: 'Remove' }).click()
    await expect(rows).toHaveCount(1)
    await expect.poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.editors.length).toBe(0)
  })

  test('the card order is picked in the general tab and saved on the board', async ({ page }) => {
    // Own board: the shared one keeps the default order for the other tests
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}order`
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'general')))?.finished()
    await page.locator('[data-id="boardCardOrder"]').click()
    await page.locator('div.hulyPopup-container .hulyPopup-row', { hasText: 'Priority' }).click()
    await expect
      .poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.orderBy?.[0])
      .toBe('priority')
  })

  test('the description is saved on the board when the field loses focus', async ({ page }) => {
    // Own board: the shared one keeps no description for the other tests
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}description`
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'general')))?.finished()
    await page.locator('#board-description').fill('About this board')
    await page.locator('#board-title').focus()
    await expect
      .poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.description)
      .toBe('About this board')
  })

  test('the board switcher in the header is a dropdown with a chevron', async ({ page }) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'general')
    const switcher = page.locator('[data-id="boardSettingsSwitcher"]')
    await expect(switcher).toContainText(`${titlePrefix}board`)
    await expect(switcher.locator('svg').last()).toBeVisible()
  })

  test('colors: the example shows a card with the border of each rule that has an issue, and says so for the rest', async ({
    page
  }, testInfo) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'colorRules')
    const example = page.locator('[data-id="boardColorExample"]')
    await expect(example).toBeVisible()
    await expect(example.locator('[data-id="boardColorSample"]')).toHaveCount(2)
    // Any issue of the rule's status may stand for it: the project also holds seeded and boards.spec.ts issues
    await expect(example.locator('[data-id="boardColorSample"] .tracker-card.accent')).toHaveCount(2)
    await expect(example.locator('[data-id="boardColorSampleNone"]')).toHaveCount(1)
    await expect(example.locator('[data-id="boardColorSampleNone"]')).toContainText(
      'No issue of the board fits this rule'
    )
    try {
      for (const density of cardDensities) {
        await client.updateDoc(tracker.class.Board, core.space.Workspace, boardId, { density })
        await expect(example.locator(`.tracker-card[data-density="${density}"]`)).toHaveCount(2)
        await expect
          .poll(
            async () =>
              await example.locator('[data-id="boardColorSample"]').evaluateAll((samples) =>
                samples.every((sample) => {
                  const card = sample.querySelector('.tracker-card')
                  return (
                    card !== null &&
                    Math.abs(sample.getBoundingClientRect().height - card.getBoundingClientRect().height - 2) <= 1
                  )
                })
              )
          )
          .toBe(true)
        const empty = await example.locator('[data-id="boardColorSampleNone"]').boundingBox()
        expect(empty?.height).toBeCloseTo(64, 0)
        await testInfo.attach(`color-preview-${density}`, {
          body: await example.screenshot(),
          contentType: 'image/png'
        })
      }
    } finally {
      await client.updateDoc(tracker.class.Board, core.space.Workspace, boardId, { density: 'normal' })
    }
  })

  test('FUSIO-1683 color rules keep one empty draft and discard it on reload', async ({ page }) => {
    const board = await client.findOne(tracker.class.Board, { _id: boardId })
    if (board === undefined) throw new Error('no board')
    const { _id, _class, space, modifiedOn, modifiedBy, createdOn, createdBy, ...data } = board
    const stored = [...board.colorRules, { id: 'legacy-empty', color: 0, condition: '' }]
    const id = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      ...data,
      title: `${titlePrefix}color-draft`,
      colorRules: stored
    })
    const boards = new BoardsPage(page)
    await page.goto(boards.boardUrl(id, true, 'colorRules'))
    const rows = boards.settingsTab('colorRules').locator('[data-id="boardRule"]')
    const add = page.locator('[data-id="boardAddRule"]')
    await expect(rows).toHaveCount(3)
    await add.click()
    await expect(rows).toHaveCount(4)
    await expect(add).toBeDisabled()
    expect((await client.findOne(tracker.class.Board, { _id: id }))?.colorRules).toEqual(stored)
    await page.reload()
    await expect(rows).toHaveCount(3)
    await expect(add).toBeEnabled()
    await add.click()
    await rows.first().locator('.filter-section button.square').click()
    await expect(rows).toHaveCount(3)
    await expect(add).toBeDisabled()
    await expect
      .poll(async () => (await client.findOne(tracker.class.Board, { _id: id }))?.colorRules)
      .toEqual(board.colorRules.slice(1))
    await page.reload()
    await expect(rows).toHaveCount(2)
    await expect(add).toBeEnabled()
    await add.click()
    await rows.last().locator('[data-id="boardRemoveRule"]').click()
    await expect(rows).toHaveCount(2)
    await expect(add).toBeEnabled()
  })

  test('controls without a model field are absent while the flags are off', async ({ page }) => {
    const boards = new BoardsPage(page)
    const absent: Record<string, string[]> = {
      general: ['boardHideDone'],
      columns: ['boardWipMin', 'boardDaysInColumn'],
      swimlanes: ['boardLaneExample'],
      quickFilters: ['boardQuickFilterOnBoard'],
      colorRules: ['boardColorBy']
    }
    for (const [tab, ids] of Object.entries(absent)) {
      await openTab(boards, tab)
      // The tab content is up before the absence counts
      const ready: Record<string, () => Locator> = {
        general: boards.settingsGeneral,
        columns: boards.settingsColumns
      }
      await expect((ready[tab] ?? (() => boards.settingsTab(tab)))()).toBeVisible()
      for (const id of ids) {
        await expect(page.locator(`[data-id="${id}"]`), `${tab}: ${id}`).toHaveCount(0)
      }
    }
    // The card tab hides as a whole: its link opens the general tab
    await expect(page.locator('[data-id="boardSettingsTab-card"]')).toHaveCount(0)
    await openTab(boards, 'card')
    await expect(boards.settingsGeneral()).toBeVisible()
    // What stays: the max limit field of the open column editor and the rule rows
    await openTab(boards, 'columns')
    await expect(boards.settingsColumns()).toBeVisible()
    await expect(boards.settingsColumn()).toHaveCount(2)
    await expect(boards.settingsColumns().locator('input[type="number"]')).toHaveCount(2)
  })
})
