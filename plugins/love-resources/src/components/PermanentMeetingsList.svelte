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
  import love, { type MeetingEventLink, type MeetingGroup, type PermanentMeeting } from '@hcengineering/love'
  import { copyTextToClipboard, createQuery, getClient, onClient } from '@hcengineering/presentation'
  import ui, { EditBox, Icon, Label, showPopup } from '@hcengineering/ui'
  import { formatDateValue, IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { openDoc } from '@hcengineering/view-resources'
  import { onMount } from 'svelte'
  import { joinMeetingBySession } from '../meetings'
  import { getEventMeetingLink, notifyCopied } from '../utils'
  import { mergeMeetingIntoGroup, moveItem, persistOrder, renameMeetingGroup } from '../groups'
  import { canEditMeeting, canLeaveMeeting, isPermanentMeetingCreator } from '../permissions'
  import { nextOccurrence } from '../period'

  const client = getClient()

  let meetings: PermanentMeeting[] = []
  let groups: MeetingGroup[] = []

  // The series of every meeting, to tell when it happens next. Occurrences are skipped: they carry a
  // copy of the mixin and would answer for the same meeting several times.
  let series: Event[] = []

  const meetingsQuery = createQuery()
  const groupsQuery = createQuery()
  const seriesQuery = createQuery()

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
    return next === undefined ? undefined : formatDateValue(next, DateRangeMode.DATE)
  }

  type DragKind = 'group' | 'meeting'
  let drag: { kind: DragKind, id: string } | undefined = undefined

  function orderOfGroups (): MeetingGroup[] {
    return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  function meetingsOf (group?: Ref<MeetingGroup>): PermanentMeeting[] {
    return meetings.filter((it) => it.group === group).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
  $: sections = buildSections(groups, meetings, series)

  function buildSections (
    groupsList: MeetingGroup[],
    meetingsList: PermanentMeeting[],
    seriesList: Event[]
  ): Section[] {
    const me = getCurrentAccount()
    const byOrder = (a: { order?: number }, b: { order?: number }): number => (a.order ?? 0) - (b.order ?? 0)
    const rowsOf = (group?: Ref<MeetingGroup>): Row[] =>
      meetingsList
        .filter((it) => it.group === group)
        .sort(byOrder)
        .map((meeting) => ({
          meeting,
          next: nextLabel(meeting, seriesList),
          canEdit: canEditMeeting(meeting, me),
          canDelete: isPermanentMeetingCreator(meeting, me),
          canLeave: canLeaveMeeting(meeting, me)
        }))

    const res: Section[] = [...groupsList]
      .sort(byOrder)
      .map((group) => ({ group, rows: rowsOf(group._id) }))
    res.push({ group: undefined, rows: rowsOf(undefined) })
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
</script>

<div class="flex-col flex-gap-1" data-id="permanent-meetings-list">
  {#each sections as section (section.group?._id ?? 'ungrouped')}
    {#if section.group !== undefined}
      <div
        class="group-header"
        draggable={true}
        on:dragstart={() => startGroupDrag(section)}
        on:dragover|preventDefault
        on:drop|preventDefault={() => void dropOnSection(section)}
        data-id="permanent-meeting-group"
      >
        <span class="drag-handle">⋮⋮</span>
        {#if renaming === section.group._id}
          <EditBox
            bind:value={renameValue}
            kind="small-style"
            autoFocus
            on:change={() => finishRenameSection(section)}
            on:blur={() => finishRenameSection(section)}
            on:keydown={(e) => e.key === 'Enter' && finishRenameSection(section)}
          />
        {:else}
          <span class="group-title">{section.group.name}</span>
          <IconButton
            icon={view.icon.Edit}
            size="small"
            kind="ghost"
            tooltip={{ label: love.string.MeetingGroup }}
            on:click={() => startRenameSection(section)}
          />
        {/if}
      </div>
    {:else}
      <div
        class="group-header ungrouped"
        on:dragover|preventDefault
        on:drop|preventDefault={() => void dropOnSection(section)}
        data-id="permanent-meeting-ungrouped"
      >
        <span class="group-title"><Label label={love.string.MeetingsWithoutGroup} /></span>
      </div>
    {/if}
    {#each section.rows as row (row.meeting._id)}
      <div
        class="meeting-row"
        draggable={true}
        on:dragstart={() => startDrag('meeting', row.meeting._id)}
        on:dragover|preventDefault
        on:drop|preventDefault={() => void dropOnMeeting(row.meeting._id)}
        on:click={() => openMeetingCard(row.meeting)}
        on:keydown={() => openMeetingCard(row.meeting)}
        role="button"
        tabindex="0"
        data-id="permanent-meeting-row"
      >
        <Icon icon={love.icon.MeetingMinutes} size="medium" />
        <span class="name">{row.meeting.name}</span>
        {#if row.next !== undefined}
          <span class="next">{row.next}</span>
        {/if}
        <!-- One group, packed from the right: a row with fewer actions keeps the same right edge,
             and no per-child margin can shift a single row out of line. -->
        <span class="actions">
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
              on:click={(e) => deleteMeeting(e, row.meeting)}
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
        </span>
      </div>
    {/each}
  {/each}
</div>

<style lang="scss">
  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.375rem;
    background: var(--theme-bg-accent-color);
    color: var(--theme-caption-color);
    font-weight: 500;
    cursor: grab;
  }
  .group-header.ungrouped {
    background: transparent;
    color: var(--theme-content-color);
    cursor: default;
  }

  .group-title {
    flex: 1;
  }

  .meeting-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .meeting-row:hover {
    background: var(--theme-button-hover-color);
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .next {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-content-color);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    flex-shrink: 0;
    margin-left: auto;
  }
</style>
