<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<!--
  The list of permanent meetings: named groups first, the rest below, both ordered by `order`.
  A group header and a meeting row are draggable - dropping rewrites the numbers through
  `persistOrder`, so the order survives a reload without any computed sorting.
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import core, { DateRangeMode, getCurrentAccount } from '@hcengineering/core'
  import calendar, { type Event } from '@hcengineering/calendar'
  import contact from '@hcengineering/contact'
  import { CombineAvatars, employeeRefByAccountUuidStore } from '@hcengineering/contact-resources'
  import love, {
    type MeetingEventLink,
    type MeetingGroup,
    type MeetingMinutes,
    type PermanentMeeting
  } from '@hcengineering/love'
  import type { Person } from '@hcengineering/contact'
  import { copyTextToClipboard, createQuery, getClient, onClient } from '@hcengineering/presentation'
  import ui, { DropdownLabels, EditBox, Icon, Label, SearchInput, showPopup } from '@hcengineering/ui'
  import { formatDateValue, IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { openDoc, PersonIdPresenter } from '@hcengineering/view-resources'
  import { get } from 'svelte/store'
  import { joinMeetingBySession } from '../meetings'
  import { getEventMeetingLink, notifyCopied } from '../utils'
  import { mergeMeetingIntoGroup, moveItem, persistOrder, renameMeetingGroup } from '../groups'
  import { canEditMeeting, canLeaveMeeting, isPermanentMeetingCreator } from '../permissions'
  import { nextOccurrence } from '../period'
  import PermanentMeetingsFields from './PermanentMeetingsFields.svelte'

  const client = getClient()

  let meetings: PermanentMeeting[] = []
  let groups: MeetingGroup[] = []

  // The series of every meeting, to tell when it happens next. Occurrences are skipped: they carry a
  // copy of the mixin and would answer for the same meeting several times.
  let series: Event[] = []

  // Past sessions of the permanent meetings: the end of the latest one is one of the columns.
  let sessions: MeetingMinutes[] = []

  // Search and filter above the table. The filter is a mode, not a saved view: the list is short and
  // the three modes answer the questions people actually ask of it.
  let search = ''
  let mode: 'all' | 'mine' | 'upcoming' = 'all'
  const filterItems = [
    { id: 'all', label: love.string.MeetingsAll },
    { id: 'mine', label: love.string.MeetingsMine },
    { id: 'upcoming', label: love.string.MeetingsUpcoming }
  ]

  // Extra columns the user turns on, kept in the browser: a personal preference, not workspace data.
  const FIELDS_KEY = 'love.permanentMeetings.fields'
  let fields: string[] = readFields()

  function readFields (): string[] {
    try {
      const raw = localStorage.getItem(FIELDS_KEY)
      return raw === null ? [] : (JSON.parse(raw) as string[])
    } catch {
      return []
    }
  }

  function openFields (event: MouseEvent): void {
    showPopup(
      PermanentMeetingsFields,
      {
        fields,
        onChange: (next: string[]) => {
          fields = next
          localStorage.setItem(FIELDS_KEY, JSON.stringify(next))
        }
      },
      event.currentTarget as HTMLElement
    )
  }

  /** Members of a space are accounts; the avatar stack wants persons. */
  function membersOf (meeting: PermanentMeeting): Array<Ref<Person>> {
    const byAccount = get(employeeRefByAccountUuidStore)
    const res: Array<Ref<Person>> = []
    for (const account of meeting.members) {
      const person = byAccount.get(account)
      if (person !== undefined) res.push(person as unknown as Ref<Person>)
    }
    return res
  }

  const meetingsQuery = createQuery()
  const groupsQuery = createQuery()
  const seriesQuery = createQuery()
  const sessionsQuery = createQuery()

  // The office sections mount before the client is connected (the workbench renders Hall while the
  // socket is still opening), and a one-shot reactive query issued that early never gets subscribed.
  // `onClient` re-issues them on every connect, which is also what a reconnect needs.
  onClient(() => {
    void meetingsQuery.query(love.class.PermanentMeeting, {}, (res) => {
      meetings = res
    })
    void groupsQuery.query(love.class.MeetingGroup, {}, (res) => {
      groups = res
    })
    void seriesQuery.query(
      calendar.class.Event,
      {
        [`${love.mixin.MeetingEventLink as string}.permanentMeeting`]: { $exists: true },
        recurringEventId: { $exists: false }
      } as any,
      (res) => {
        series = res
      }
    )
    void sessionsQuery.query(love.class.MeetingMinutes, { meeting: { $exists: true } } as any, (res) => {
      sessions = res
    })
  })

  /**
   * Start of the series of a meeting, the base the period is counted from. The series list is passed
   * in, not read from the component state: the caller computes these labels in one reactive
   * statement, and a hidden dependency there would leave the column empty after the data arrives.
   */
  function seriesStart (meeting: PermanentMeeting, seriesList: Event[]): number | undefined {
    for (const event of seriesList) {
      const link = event as unknown as MeetingEventLink
      if (link.permanentMeeting === meeting._id) return event.date
    }
    return undefined
  }

  function nextOf (meeting: PermanentMeeting, seriesList: Event[]): number | undefined {
    const start = seriesStart(meeting, seriesList)
    if (start === undefined) return undefined
    return nextOccurrence(start, meeting.repeatEvery, Date.now())
  }

  /** Formatted here rather than in the markup: a component call cannot carry a TS cast in Svelte 4. */
  function nextLabel (meeting: PermanentMeeting, seriesList: Event[]): string | undefined {
    const next = nextOf(meeting, seriesList)
    return next === undefined ? undefined : formatDateValue(next, DateRangeMode.DATETIME)
  }

  /** When the latest session of the meeting ended: the last real conversation it had. */
  function lastEndOf (meeting: PermanentMeeting, sessionsList: MeetingMinutes[]): number | undefined {
    let res: number | undefined
    for (const session of sessionsList) {
      if (session.meeting !== meeting._id) continue
      const end = session.meetingEnd ?? session.createdOn
      if (end === undefined) continue
      if (res === undefined || end > res) res = end
    }
    return res
  }

  function lastEndLabel (meeting: PermanentMeeting, sessionsList: MeetingMinutes[]): string | undefined {
    const end = lastEndOf(meeting, sessionsList)
    return end === undefined ? undefined : formatDateValue(end, DateRangeMode.DATETIME)
  }

  /**
   * Search and filter are applied to the meetings, not to the sections: a group left with no rows is
   * then dropped, and the list stays short. Nothing is filtered while both are empty, so an empty
   * group keeps its header and stays a drop target.
   */
  function matches (meeting: PermanentMeeting, seriesList: Event[], text: string, filter: string): boolean {
    if (text !== '' && !meeting.name.toLowerCase().includes(text)) return false
    if (filter === 'mine' && !meeting.members.includes(getCurrentAccount().uuid)) return false
    if (filter === 'upcoming' && nextOf(meeting, seriesList) === undefined) return false
    return true
  }

  type DragKind = 'group' | 'meeting'
  let drag: { kind: DragKind, id: string } | undefined = undefined

  function orderOfGroups (): MeetingGroup[] {
    return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  function startDrag (kind: DragKind, id: string): void {
    drag = { kind, id }
  }

  async function dropOnGroup (target: Ref<MeetingGroup>): Promise<void> {
    if (drag === undefined) return
    if (drag.kind === 'group') {
      const ids = orderOfGroups().map((it) => it._id)
      const from = ids.indexOf(drag.id as Ref<MeetingGroup>)
      const to = ids.indexOf(target)
      await persistOrder(client, meetings, moveItem(ids, from, to))
    } else {
      const next = mergeMeetingIntoGroup(meetings, drag.id as Ref<PermanentMeeting>, target)
      await persistOrder(client, next, orderOfGroups().map((it) => it._id))
    }
    drag = undefined
  }

  async function dropOnMeeting (target: Ref<PermanentMeeting>): Promise<void> {
    if (drag === undefined || drag.kind !== 'meeting' || drag.id === target) {
      drag = undefined
      return
    }
    const moved = meetings.find((it) => it._id === drag?.id)
    if (moved === undefined) return
    const targetDoc = meetings.find((it) => it._id === target)
    const next = mergeMeetingIntoGroup(meetings, moved._id, targetDoc?.group, target)
    await persistOrder(client, next, orderOfGroups().map((it) => it._id))
    drag = undefined
  }

  async function dropOnUngrouped (): Promise<void> {
    if (drag === undefined) return
    if (drag.kind === 'meeting') {
      const next = mergeMeetingIntoGroup(meetings, drag.id as Ref<PermanentMeeting>, undefined)
      await persistOrder(client, next, orderOfGroups().map((it) => it._id))
    }
    drag = undefined
  }

  function openSettings (meeting: PermanentMeeting): void {
    showPopup(love.component.PermanentMeetingForm, { object: meeting }, 'content')
  }

  /**
   * A row is the meeting itself: clicking it opens the card in the centre, where the series, its
   * occurrences and its activity are, not the edit form. The form is behind the gear.
   */
  function openMeetingCard (meeting: PermanentMeeting): void {
    openDoc(getClient().getHierarchy(), meeting).catch((err) => {
      console.error('[PermanentMeetingsList.openMeetingCard] Failed to open the meeting', err)
    })
  }

  async function copyLink (event: MouseEvent, meeting: PermanentMeeting): Promise<void> {
    event.stopPropagation()
    const link = await getEventMeetingLink(meeting._id, 'meeting')
    if (link === '') return
    await copyTextToClipboard(link)
    await notifyCopied(love.string.LinkCopied)
  }

  /** Deleting the meeting takes its live sessions with it: the server trigger finishes them. */
  function deleteMeeting (event: MouseEvent, meeting: PermanentMeeting): void {
    event.stopPropagation()
    showPopup(contact.component.DeleteConfirmationPopup, {
      object: meeting,
      deleteAction: async () => {
        await client.remove(meeting)
      }
    })
  }

  /** Walking out is a membership edit: the meeting itself stays. */
  async function leaveMeeting (event: MouseEvent, meeting: PermanentMeeting): Promise<void> {
    event.stopPropagation()
    await client.update(meeting, { $pull: { members: getCurrentAccount().uuid } })
  }

  interface Row {
    meeting: PermanentMeeting
    /** Formatted next occurrence, absent when the series is over or unknown. */
    next?: string
    /** Formatted end of the latest session, shown as an optional column. */
    lastEnd?: string
    /** Formatted creation date, shown as an optional column. */
    created: string
    members: Array<Ref<Person>>
    canEdit: boolean
    /** Only the creator deletes a meeting; everyone else in it can only walk out. */
    canDelete: boolean
    canLeave: boolean
  }

  interface Section {
    group?: MeetingGroup
    rows: Row[]
  }

  // One flat list of sections, the ungrouped one last: the markup then has a single branch and no
  // duplication between grouped and ungrouped rows. Computed in a reactive statement over the three
  // arrays, not by calling a helper from the markup: Svelte 4 collects dependencies from the
  // statement itself, so `{#each sections()}` would never re-render when `meetings` arrives.
  $: sections = buildSections(groups, meetings, series, sessions, search.trim().toLowerCase(), mode)

  function buildSections (
    groupsList: MeetingGroup[],
    meetingsList: PermanentMeeting[],
    seriesList: Event[],
    sessionsList: MeetingMinutes[],
    text: string,
    filter: string
  ): Section[] {
    const me = getCurrentAccount()
    const byOrder = (a: { order?: number }, b: { order?: number }): number => (a.order ?? 0) - (b.order ?? 0)
    const filtering = text !== '' || filter !== 'all'
    const rowsOf = (group?: Ref<MeetingGroup>): Row[] =>
      meetingsList
        .filter((it) => it.group === group)
        .filter((it) => matches(it, seriesList, text, filter))
        .sort(byOrder)
        .map((meeting) => ({
          meeting,
          next: nextLabel(meeting, seriesList),
          lastEnd: lastEndLabel(meeting, sessionsList),
          created: formatDateValue(meeting.createdOn ?? meeting.modifiedOn, DateRangeMode.DATE),
          members: membersOf(meeting),
          canEdit: canEditMeeting(meeting, me),
          canDelete: isPermanentMeetingCreator(meeting, me),
          canLeave: canLeaveMeeting(meeting, me)
        }))

    const res: Section[] = [...groupsList]
      .sort(byOrder)
      .map((group) => ({ group, rows: rowsOf(group._id) }))
      // While a filter is on, an empty group is dropped instead of leaving a header with nothing
      // under it; otherwise every group stays, so a drop target exists for a meeting being moved.
      .filter((section) => !filtering || section.rows.length > 0)
    const ungrouped = rowsOf(undefined)
    if (!filtering || ungrouped.length > 0) res.push({ group: undefined, rows: ungrouped })
    return res
  }

  function startGroupDrag (section: Section): void {
    if (section.group !== undefined) startDrag('group', section.group._id)
  }

  async function dropOnSection (section: Section): Promise<void> {
    if (section.group !== undefined) await dropOnGroup(section.group._id)
    else await dropOnUngrouped()
  }

  let renaming: Ref<MeetingGroup> | undefined = undefined
  let renameValue = ''

  function startRename (group: MeetingGroup): void {
    renaming = group._id
    renameValue = group.name
  }

  async function finishRename (group: MeetingGroup): Promise<void> {
    renaming = undefined
    await renameMeetingGroup(client, group, renameValue)
  }

  function startRenameSection (section: Section): void {
    if (section.group !== undefined) startRename(section.group)
  }

  function finishRenameSection (section: Section): void {
    if (section.group !== undefined) void finishRename(section.group)
  }

  // Groups fold the way the sections of a view list do: the caret hides the rows, the header and its
  // count stay in place, so a long list is scanned by group names first.
  let folded = new Set<string>()

  function foldKey (section: Section): string {
    return section.group?._id ?? 'ungrouped'
  }

  function toggleFold (section: Section): void {
    const key = foldKey(section)
    if (folded.has(key)) folded.delete(key)
    else folded.add(key)
    folded = folded
  }

  // Width of the group row: the fixed columns plus whichever optional ones are switched on.
  $: extraColumns = ['createdOn', 'createdBy', 'lastEnd'].filter((it) => fields.includes(it)).length
  $: columns = 4 + extraColumns
</script>

<div class="flex-col h-full" data-id="permanent-meetings-list">
  <!-- Search and field switch sit above the table, the way the protocols toolbar does. -->
  <div class="pm-toolbar">
    <div class="pm-toolbar__search"><SearchInput bind:value={search} /></div>
    <div class="flex-grow" />
    <DropdownLabels
      label={ui.string.Filter}
      icon={view.icon.Filter}
      items={filterItems}
      bind:selected={mode}
      size="small"
      dataId="permanent-meetings-filter"
    />
    <IconButton
      icon={ui.icon.Gear}
      size="small"
      kind="ghost"
      tooltip={{ label: love.string.Fields }}
      on:click={openFields}
    />
  </div>

  <!-- The same table the protocols use (`antiTable`): one header with column titles, rows of the
       same height and dividers, hover per row. A list of its own kept drifting away from it. -->
  <div class="pm-list">
    <table class="antiTable">
      <thead class="scroller-thead">
        <tr class="scroller-thead__tr">
          <th class="align-left">
            <div class="antiTable-cells"><Label label={love.string.PermanentMeeting} /></div>
          </th>
          <th class="align-left pm-col-next">
            <div class="antiTable-cells"><Label label={love.string.NextOccurrence} /></div>
          </th>
          <th class="align-left pm-col-members">
            <div class="antiTable-cells"><Label label={contact.string.Members} /></div>
          </th>
          {#if fields.includes('createdOn')}
            <th class="align-left pm-col-date">
              <div class="antiTable-cells"><Label label={core.string.CreatedDate} /></div>
            </th>
          {/if}
          {#if fields.includes('createdBy')}
            <th class="align-left pm-col-people">
              <div class="antiTable-cells"><Label label={core.string.CreatedBy} /></div>
            </th>
          {/if}
          {#if fields.includes('lastEnd')}
            <th class="align-left pm-col-date">
              <div class="antiTable-cells"><Label label={love.string.PastLast} /></div>
            </th>
          {/if}
          <th class="pm-col-actions"><div class="antiTable-cells" /></th>
        </tr>
      </thead>
      <tbody>
        {#each sections as section (section.group?._id ?? 'ungrouped')}
          <!-- A group is a row of the table, not a column: the header spans the full width, carries
               the caret and the rename, and is the drop target for meetings. Dragging goes by the
               name itself - a handle of its own only made the row noisier. -->
          <tr
            class="pm-group"
            class:ungrouped={section.group === undefined}
            class:folded={folded.has(foldKey(section))}
            draggable={section.group !== undefined}
            on:dragstart={() => { startGroupDrag(section) }}
            on:dragover|preventDefault
            on:drop|preventDefault={() => void dropOnSection(section)}
            data-id={section.group !== undefined ? 'permanent-meeting-group' : 'permanent-meeting-ungrouped'}
          >
            <td colspan={columns}>
              <div class="pm-group__body">
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <span
                  class="pm-group__caret"
                  role="button"
                  tabindex="0"
                  on:click={() => { toggleFold(section) }}
                  on:keydown={(e) => e.key === 'Enter' && toggleFold(section)}
                >
                  <Icon icon={ui.icon.CaretRightFill} size="small" />
                </span>
                {#if section.group !== undefined}
                  {#if renaming === section.group._id}
                    <EditBox
                      bind:value={renameValue}
                      kind="small-style"
                      autoFocus
                      on:change={() => { finishRenameSection(section) }}
                      on:blur={() => { finishRenameSection(section) }}
                      on:keydown={(e) => e.key === 'Enter' && finishRenameSection(section)}
                    />
                  {:else}
                    <span class="pm-group__name">{section.group.name}</span>
                    <IconButton
                      icon={view.icon.Edit}
                      size="small"
                      kind="ghost"
                      tooltip={{ label: love.string.MeetingGroup }}
                      on:click={() => { startRenameSection(section) }}
                    />
                  {/if}
                {:else}
                  <span class="pm-group__name"><Label label={love.string.MeetingsWithoutGroup} /></span>
                {/if}
              </div>
            </td>
          </tr>
        {#if !folded.has(foldKey(section))}
          {#each section.rows as row (row.meeting._id)}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <tr
              class="antiTable-body__row pm-row"
              draggable={true}
              on:dragstart={() => { startDrag('meeting', row.meeting._id) }}
              on:dragover|preventDefault
              on:drop|preventDefault={() => void dropOnMeeting(row.meeting._id)}
              on:click={() => { openMeetingCard(row.meeting) }}
              on:keydown={(e) => e.key === 'Enter' && openMeetingCard(row.meeting)}
              tabindex="0"
              data-id="permanent-meeting-row"
            >
              <td class="align-left">
                <div class="antiTable-cells__firstCell pm-row__first">
                  <Icon icon={love.icon.MeetingMinutes} size="small" />
                  <span class="pm-row__name">{row.meeting.name}</span>
                </div>
              </td>
              <td class="align-left pm-col-next">
                {#if row.next !== undefined}
                  <span class="pm-row__next">{row.next}</span>
                {/if}
              </td>
              <td class="align-left pm-col-members">
                <CombineAvatars _class={contact.mixin.Employee} items={row.members} size="small" limit={3} />
              </td>
              {#if fields.includes('createdOn')}
                <td class="align-left pm-col-date pm-row__meta">
                  {row.created}
                </td>
              {/if}
              {#if fields.includes('createdBy')}
                <td class="align-left pm-col-people">
                  <PersonIdPresenter value={row.meeting.createdBy} avatarSize="x-small" />
                </td>
              {/if}
              {#if fields.includes('lastEnd')}
                <td class="align-left pm-col-date pm-row__meta">
                  {row.lastEnd ?? ''}
                </td>
              {/if}
              <td class="pm-col-actions">
                <div class="pm-row__actions">
                  <IconButton
                    icon={view.icon.CopyLink}
                    size="small"
                    kind="ghost"
                    tooltip={{ label: love.string.CopyMeetingLink }}
                    on:click={(e) => void copyLink(e, row.meeting)}
                  />
                  <IconButton
                    icon={love.icon.Cam}
                    size="small"
                    kind="ghost"
                    tooltip={{ label: love.string.JoinMeeting }}
                    on:click={(e) => {
                      e.stopPropagation()
                      void joinMeetingBySession(row.meeting._id, 'meeting')
                    }}
                  />
                  {#if row.canEdit}
                    <IconButton
                      icon={ui.icon.Gear}
                      size="small"
                      kind="ghost"
                      tooltip={{ label: ui.string.Settings }}
                      on:click={(e) => {
                        e.stopPropagation()
                        openSettings(row.meeting)
                      }}
                    />
                  {/if}
                  {#if row.canDelete}
                    <IconButton
                      icon={view.icon.Delete}
                      size="small"
                      kind="ghost"
                      tooltip={{ label: view.string.Delete }}
                      on:click={(e) => { deleteMeeting(e, row.meeting) }}
                    />
                  {:else if row.canLeave}
                    <IconButton
                      icon={view.icon.Leave}
                      size="small"
                      kind="ghost"
                      tooltip={{ label: view.string.Leave }}
                      on:click={(e) => void leaveMeeting(e, row.meeting)}
                    />
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      {/each}
    </tbody>
  </table>
  </div>
</div>

<style lang="scss">
  .pm-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    flex: 0 0 auto;
  }

  .pm-toolbar__search {
    min-width: 12rem;
  }

  .pm-list {
    flex: 1 1 0;
    min-height: 0;
    overflow: auto;
  }

  /* Fixed widths for the metadata columns: the name column keeps whatever is left. */
  .pm-col-next,
  .pm-col-date {
    width: 11rem;
  }

  .pm-col-members {
    width: 7rem;
  }

  .pm-col-people {
    width: 12rem;
  }

  .pm-col-actions {
    width: 8rem;
    padding-right: 0.5rem;
  }

  /* Group header: the language of the platform's grouped lists (`.categoryHeader` of a view list) -
     44px, sticky under the table header, caret, bold name on the page background. A long list then
     always shows which group is being read, and the repeating accent bar that made it stripe is
     gone. */
  .pm-group td {
    position: sticky;
    top: 3rem;
    z-index: 1;
    padding: 0 1.5rem;
    background: var(--theme-bg-color);
    border-bottom: 1px solid var(--theme-divider-color);
  }

  .pm-group__body {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.75rem;
    color: var(--theme-caption-color);
    font-weight: 500;
  }

  .pm-group.ungrouped .pm-group__body {
    color: var(--theme-content-color);
    font-weight: 400;
  }

  .pm-group__caret {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--theme-dark-color);
    cursor: pointer;
    transform: rotate(90deg);
    transform-origin: center;
    transition: transform 0.15s ease-in-out;
  }

  .pm-group.folded .pm-group__caret {
    transform: none;
  }

  .pm-group.ungrouped {
    cursor: default;
  }

  .pm-group__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-row {
    cursor: pointer;
  }

  .pm-row__first {
    gap: 0.5rem;
    min-width: 0;
    width: 100%;
  }

  .pm-row__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pm-row__next,
  .pm-row__meta {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    white-space: nowrap;
  }

  /* Packed from the right with no extra gap: the icon buttons carry their own padding, which is what
     keeps the right edge of every row on the same line. */
  .pm-row__actions {
    display: flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    justify-content: flex-end;
  }
</style>
