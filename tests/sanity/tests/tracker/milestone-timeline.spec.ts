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
import tracker, { type Issue, type Milestone } from '@hcengineering/tracker'
import { type Ref, type TxOperations } from '@hcengineering/core'
import type { Person } from '@hcengineering/contact'
import {
  connectTracker,
  createIssue,
  createMilestone,
  deleteIssuesByTitlePrefix,
  deleteMilestonesByLabelPrefix,
  findPersonByLastName,
  getProjectContext,
  readIssueDates,
  setIssueDates,
  type ProjectContext
} from '../API/TrackerApi'
import { MilestoneTimelinePage } from '../model/tracker/milestone-timeline-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { PlatformSetting, generateId } from '../utils'

test.use({ storageState: PlatformSetting })

// Plans live in the previous month: the timeline opens at its first day,
// so bars stay inside the viewport whatever today is (drags need that).
function addDays (date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Monday between the 3rd and the 9th of the previous month, local midnight.
function planStart (): Date {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d
}

const pad = (n: number): string => String(n).padStart(2, '0')

const dateParts = (d: Date): { day: string, month: string, year: string } => ({
  day: pad(d.getDate()),
  month: pad(d.getMonth() + 1),
  year: String(d.getFullYear())
})

// DatePresenter: "5 Oct" or "Oct 5" by the browser locale, the year only when it is not the current one.
function shownDate (d: Date): RegExp {
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(d)
  const year = d.getFullYear() !== new Date().getFullYear() ? `,? ${d.getFullYear()}` : ''
  return new RegExp(`(^|\\s)(${d.getDate()} ${month}|${month} ${d.getDate()})${year}(\\s|$)`)
}

test.describe('Milestone timeline', () => {
  let client: TxOperations
  let ctx: ProjectContext
  let john: Ref<Person>
  let rosamund: Ref<Person>
  const prefix = `mtl-${generateId(6)}-`

  test.beforeAll(async () => {
    client = (await connectTracker()).client
    ctx = await getProjectContext(client)
    john = await findPersonByLastName(client, 'Appleseed')
    rosamund = await findPersonByLastName(client, 'Chen')
  })

  test.afterAll(async () => {
    if (client === undefined) return
    await deleteIssuesByTitlePrefix(client, prefix)
    await deleteMilestonesByLabelPrefix(client, prefix)
    await client.close()
  })

  const name = (what: string): string => `${prefix}${what}-${generateId(6)}`

  async function seedMilestone (label: string): Promise<{ id: Ref<Milestone>, start: Date, target: Date }> {
    const start = planStart()
    const target = addDays(start, 11)
    const id = await createMilestone(client, ctx.project._id, {
      label,
      startDate: start.getTime(),
      targetDate: target.getTime()
    })
    return { id, start, target }
  }

  // Issue of the milestone on the timeline: Monday to Friday of its first week.
  async function seedScheduledIssue (
    title: string,
    milestone: Ref<Milestone>,
    start: Date,
    opts: { assignee?: Ref<Person>, status?: 'Todo' | 'Done', days?: number } = {}
  ): Promise<Ref<Issue>> {
    const due = addDays(start, opts.days ?? 4)
    const id = await createIssue(client, ctx, {
      title,
      status: opts.status ?? 'Todo',
      assignee: opts.assignee,
      dueDate: due.getTime(),
      attributes: { milestone }
    })
    await setIssueDates(client, id, { startDate: start.getTime() })
    return id
  }

  async function identifierOf (id: Ref<Issue>): Promise<string> {
    const issue = await client.findOne(tracker.class.Issue, { _id: id })
    if (issue === undefined) throw new Error(`Issue ${id} not found`)
    return issue.identifier
  }

  test('Milestone start date and stats in the list', async ({ page }) => {
    const label = name('start')
    const start = planStart()
    const target = addDays(start, 11)
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.createNewMilestone({
      name: label,
      startDate: dateParts(start),
      targetDate: dateParts(target)
    })
    // The date popup stores noon UTC of the picked local day (convertToDay), not local midnight
    const day = (ts: number | null | undefined): string => (ts == null ? '' : new Date(ts).toDateString())
    await expect
      .poll(async () => day((await client.findOne(tracker.class.Milestone, { label }))?.startDate), { timeout: 15000 })
      .toBe(start.toDateString())
    const created = await client.findOne(tracker.class.Milestone, { label })
    expect(day(created?.targetDate)).toBe(target.toDateString())

    await createIssue(client, ctx, {
      title: name('done'),
      status: 'Done',
      attributes: { milestone: created?._id }
    })
    await createIssue(client, ctx, {
      title: name('todo'),
      status: 'Todo',
      attributes: { milestone: created?._id }
    })

    await milestones.expandCollapsedCategories()
    const row = milestones.listRow(label)
    await expect(row).toContainText(shownDate(start))
    await expect(row).toContainText(shownDate(target))
    await expect(row).toContainText('1/2')
    await expect(row).toContainText('50%')
  })

  test('Table and Timeline views of the milestones page', async ({ page }) => {
    const label = name('views')
    const { id, start } = await seedMilestone(label)
    await createIssue(client, ctx, { title: name('done'), status: 'Done', attributes: { milestone: id } })
    await createIssue(client, ctx, { title: name('todo'), status: 'Todo', attributes: { milestone: id } })
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.switchViewlet('Table')
    await expect(page.locator('table.antiTable th', { hasText: 'Start date' })).toBeVisible()
    const tableRow = page.locator('table.antiTable tr.antiTable-body__row', { hasText: label })
    await expect(tableRow).toContainText(shownDate(start))
    await expect(tableRow).toContainText('1/2')

    await milestones.switchViewlet('Timeline')
    const bar = milestones.bar(id)
    await expect(bar).toBeVisible()
    await expect(bar).toContainText(label)
    await expect(bar).toContainText('1/2')
    await expect(bar).toContainText('50%')
  })

  test('Add an existing issue to the milestone from the timeline', async ({ page }) => {
    const label = name('add')
    const { id, start } = await seedMilestone(label)
    const title = name('free-issue')
    const issueId = await createIssue(client, ctx, { title, status: 'Todo' })
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.switchViewlet('Timeline')
    await expect(milestones.bar(id)).toBeVisible()
    // Unscheduled issues have no row on the milestone timeline
    await expect(milestones.bar(issueId)).toHaveCount(0)

    await milestones.addExistingIssue(id, title)

    const bar = milestones.bar(issueId)
    await expect(bar).toBeVisible()
    // The issue gets its own row below the milestone row
    await expect(milestones.rowHeader(issueId)).toContainText(title)
    const milestoneRow = await milestones.row(id).getAttribute('data-row')
    const issueRow = await milestones.row(issueId).getAttribute('data-row')
    expect(Number(issueRow)).toBeGreaterThan(Number(milestoneRow))

    await expect
      .poll(async () => {
        const dates = await readIssueDates(client, issueId)
        return {
          start: dates?.startDate,
          milestone: (await client.findOne(tracker.class.Issue, { _id: issueId }))?.milestone
        }
      })
      .toEqual({ start: start.getTime(), milestone: id })
  })

  test('Assignee grouping puts the issue bar into a person row', async ({ page }) => {
    const label = name('group')
    const { id, start } = await seedMilestone(label)
    const title = name('grouped')
    const issueId = await seedScheduledIssue(title, id, start, { assignee: john })
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.switchViewlet('Timeline')
    await expect(milestones.bar(issueId)).toBeVisible()
    // No grouping: the row is the issue itself
    await expect(milestones.rowHeader(issueId)).toContainText(title)

    try {
      await milestones.setGrouping('Assignee')
      await expect(milestones.rowHeader(issueId)).not.toContainText(title)
      await expect(milestones.rowHeader(issueId)).toContainText(/Appleseed|John/)
      // Still under the milestone, bar inside the person row
      await expect(milestones.bar(id)).toBeVisible()
      await expect(milestones.row(issueId).locator(`.component-item[data-key="${issueId}"]`)).toBeVisible()
      const milestoneRow = await milestones.row(id).getAttribute('data-row')
      const personRow = await milestones.row(issueId).getAttribute('data-row')
      expect(Number(personRow)).toBeGreaterThan(Number(milestoneRow))
    } finally {
      // View options are stored per user; leave the shared setting as found
      await milestones.setGrouping('No grouping')
    }
  })

  test('Milestone panel: list/timeline switch and issue in the sidebar', async ({ page }) => {
    const label = name('panel')
    const { id, start } = await seedMilestone(label)
    const title = name('panel-issue')
    const issueId = await seedScheduledIssue(title, id, start)
    const identifier = await identifierOf(issueId)
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.openMilestoneByName(label)
    const panel = page.locator('.popupPanel')
    await expect(panel.locator('input[placeholder="Milestone name"]')).toHaveValue(label)

    await panel.locator('label[data-id="tab-timeline"]').click()
    await expect(milestones.bar(issueId, panel)).toBeVisible()
    await expect(milestones.rowHeader(issueId, panel)).toContainText(title)

    await panel.locator('label[data-id="tab-list"]').click()
    await expect(milestones.timeline(panel)).toHaveCount(0)
    await panel.locator('label[data-id="tab-timeline"]').click()
    await expect(milestones.bar(issueId, panel)).toBeVisible()

    await milestones.rowHeader(issueId, panel).locator('span.over-underline', { hasText: identifier }).click()

    const sidebar = page.locator('#sidebar')
    await expect(sidebar).toBeVisible()
    // The preview shows the title either as text or as the value of an input
    await expect
      .poll(
        async () =>
          await sidebar.evaluate(
            (el: HTMLElement) =>
              `${el.innerText} ${Array.from(el.querySelectorAll('input,textarea'))
                .map((i) => (i as HTMLInputElement).value)
                .join(' ')}`
          )
      )
      .toContain(title)
    // The milestone panel stays open
    await expect(panel.locator('input[placeholder="Milestone name"]')).toHaveValue(label)
  })

  test('Issue panel: milestone in the title and dates-based estimate', async ({ page }) => {
    const label = name('issue-panel')
    const { id, start } = await seedMilestone(label)
    // Monday to Wednesday: three work days
    const planned = await seedScheduledIssue(name('planned'), id, start, { days: 2 })
    // Due before the start: no estimate
    const backwards = await seedScheduledIssue(name('backwards'), id, start, { days: -2 })
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openIssue(await identifierOf(planned))
    await expect(page.locator('[data-id="issue-title-milestone"]')).toContainText(label)
    await expect(page.locator('[data-id="issue-dates-estimate"]').first()).toContainText('24h')

    await milestones.openIssue(await identifierOf(backwards))
    await expect(page.locator('[data-id="issue-title-milestone"]')).toContainText(label)
    await expect(page.locator('[data-id="issue-dates-estimate"]')).toHaveCount(0)
  })

  test('Status change sets the TimeManaged start date', async ({ page }) => {
    const milestones = new MilestoneTimelinePage(page)
    const details = new IssuesDetailsPage(page)
    const start = planStart()

    const moved = await createIssue(client, ctx, { title: name('moved'), status: 'Todo' })
    // Start already set: moving to In Progress must not touch it
    const dated = await createIssue(client, ctx, { title: name('dated'), status: 'Todo' })
    await setIssueDates(client, dated, { startDate: start.getTime() })

    await milestones.openIssue(await identifierOf(moved))
    await details.editIssue({ status: 'In Progress' })
    await expect
      .poll(async () => (await readIssueDates(client, moved))?.startDate, { timeout: 15000 })
      .toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000)

    await milestones.openIssues()
    await milestones.switchViewlet('Timeline')
    await expect(milestones.bar(moved)).toBeVisible()
    const startedAt = (await readIssueDates(client, moved))?.startDate

    const progressStatus = ctx.statuses.get('In Progress')
    const datedIssue = await client.findOne(tracker.class.Issue, { _id: dated })
    if (datedIssue === undefined || progressStatus === undefined) throw new Error('seed data missing')
    await client.update(datedIssue, { status: progressStatus })
    await milestones.openIssue(await identifierOf(moved))
    await details.editIssue({ status: 'Done' })

    // Server transactions of one workspace apply in order: once `moved` is Done, `dated` went through the trigger too.
    await expect
      .poll(async () => (await client.findOne(tracker.class.Issue, { _id: moved }))?.isDone, { timeout: 15000 })
      .toBe(true)
    expect((await readIssueDates(client, moved))?.startDate).toBe(startedAt)
    expect((await readIssueDates(client, dated))?.startDate).toBe(start.getTime())
  })

  test('Issues timeline: month and range persist after reload', async ({ page }) => {
    const milestones = new MilestoneTimelinePage(page)
    await milestones.openIssues()
    await milestones.switchViewlet('Timeline')

    const monthLabel = page.locator('[data-id="timeline-month-label"]')
    const range = page.locator('[data-id="timeline-range"]')
    await expect(monthLabel).toBeVisible()
    await expect(range).toContainText('3 months')
    const initial = (await monthLabel.innerText()).trim()

    await page.locator('[data-id="timeline-month-next"]').click()
    await page.locator('[data-id="timeline-month-next"]').click()
    await expect(monthLabel).not.toHaveText(initial)
    const shifted = (await monthLabel.innerText()).trim()

    await milestones.setRange('6 months')

    await page.reload()
    await expect(milestones.timeline()).toBeVisible()
    await expect(monthLabel).toHaveText(shifted)
    await expect(range).toContainText('6 months')

    // Back to the defaults for the other tests of this user
    await milestones.setRange('3 months')
    await page.locator('[data-id="timeline-month-prev"]').click()
    await page.locator('[data-id="timeline-month-prev"]').click()
    await expect(monthLabel).toHaveText(initial)
  })

  test('Dragging a bar moves the dates and the bar stays', async ({ page }) => {
    const label = name('drag')
    const { id, start } = await seedMilestone(label)
    const issueId = await seedScheduledIssue(name('dragged'), id, start)
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.switchViewlet('Timeline')
    const bar = milestones.bar(issueId)
    await expect(bar).toBeVisible()
    // Monday-Friday is five days wide minus the 1px gap
    const box = await bar.boundingBox()
    if (box === null) throw new Error('bar has no bounding box')
    const dayWidth = (box.width + 1) / 5
    const left = await milestones.barLeft(bar)
    const days = 3

    await milestones.dragBar(bar, days * dayWidth)

    // The dropped position is shown at once ...
    await expect.poll(async () => Math.abs((await milestones.barLeft(bar)) - (left + days * dayWidth)) <= 2).toBe(true)
    // ... the dates reach the server, and the bar does not jump back when the update arrives
    await expect
      .poll(async () => await readIssueDates(client, issueId), { timeout: 15000 })
      .toMatchObject({ startDate: addDays(start, days).getTime(), dueDate: addDays(start, 4 + days).getTime() })
    await expect.poll(async () => Math.abs((await milestones.barLeft(bar)) - (left + days * dayWidth)) <= 2).toBe(true)
  })

  // Runs in the milestone panel: on the milestones page every group gets placeholder rows at drag start, and with
  // many milestones in the workspace that shifts the dragged row far below the cursor (product UX issue).
  test('Dragging a bar to another assignee row changes the assignee', async ({ page }) => {
    const label = name('drag-row')
    const { id, start } = await seedMilestone(label)
    const moved = await seedScheduledIssue(name('moved'), id, start, { assignee: john })
    const other = await seedScheduledIssue(name('other'), id, start, { assignee: rosamund })
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.openMilestoneByName(label)
    const panel = page.locator('.popupPanel')
    await panel.locator('label[data-id="tab-timeline"]').click()
    try {
      await milestones.setGrouping('Assignee', panel)
      await expect(milestones.bar(moved, panel)).toBeVisible()
      await expect(milestones.bar(other, panel)).toBeVisible()
      const johnRow = await milestones.row(moved, panel).getAttribute('data-row')
      const rosamundRow = await milestones.row(other, panel).getAttribute('data-row')
      expect(johnRow).not.toBe(rosamundRow)

      await milestones.dragBar(milestones.bar(moved, panel), 0, milestones.row(other, panel))

      await expect
        .poll(async () => (await client.findOne(tracker.class.Issue, { _id: moved }))?.assignee, { timeout: 15000 })
        .toBe(rosamund)
      await expect(milestones.row(other, panel).locator(`.component-item[data-key="${moved}"]`)).toBeVisible()
    } finally {
      await milestones.setGrouping('No grouping', panel)
    }
  })

  test('Context menu on a bar opens the issue actions', async ({ page }) => {
    const label = name('menu')
    const { id, start } = await seedMilestone(label)
    const issueId = await seedScheduledIssue(name('menu-issue'), id, start)
    const milestones = new MilestoneTimelinePage(page)

    await milestones.openMilestones()
    await milestones.switchViewlet('Timeline')
    const bar = milestones.bar(issueId)
    await expect(bar).toBeVisible()

    await bar.click({ button: 'right' })
    await expect(milestones.menuEntry('Status')).toBeVisible()
    await expect(milestones.menuEntry('Assignee')).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
