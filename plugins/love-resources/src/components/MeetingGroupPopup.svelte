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
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<!--
  Merge meetings into a named group: the name goes into a borderless title field on top, the meetings
  below in a plain list. A row is the whole hit area - the box only shows the state, so a mis-tap on
  a small square does not cost anything. Meetings that already belong to a group carry its name as a
  tag, because merging moves them out of that group rather than copying.
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import love, { type MeetingGroup, type PermanentMeeting } from '@hcengineering/love'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import ui, { Icon, Label, Modal, ModernEditbox, Scroller } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { createMeetingGroup } from '../groups'

  const dispatch = createEventDispatcher()
  const client = getClient()

  let name = ''
  let meetings: PermanentMeeting[] = []
  let groups = new Map<Ref<MeetingGroup>, string>()
  let selected = new Set<Ref<PermanentMeeting>>()
  let saving = false

  const query = createQuery()
  $: void query.query(love.class.PermanentMeeting, {}, (res) => {
    // Ungrouped first: those are the ones a new group is usually made for. `name` is declared on
    // Space but older rows may still miss it, and comparing undefined throws inside the sort.
    meetings = [...res].sort((a, b) => {
      if ((a.group === undefined) !== (b.group === undefined)) return a.group === undefined ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  })

  const groupQuery = createQuery()
  $: void groupQuery.query(love.class.MeetingGroup, {}, (res) => {
    groups = new Map(res.map((it) => [it._id, it.name]))
  })

  function toggle (id: Ref<PermanentMeeting>): void {
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    selected = selected
  }

  $: canSave = !saving && name.trim() !== '' && selected.size > 0

  function close (): void {
    dispatch('close')
  }

  async function save (): Promise<void> {
    if (!canSave) return
    saving = true
    try {
      const chosen = meetings.filter((it) => selected.has(it._id))
      await createMeetingGroup(client, name.trim(), chosen)
      dispatch('close')
    } finally {
      saving = false
    }
  }
</script>

<Modal
  label={love.string.CreateMeetingGroup}
  type="type-popup"
  width="small"
  padding="0"
  okLabel={presentation.string.Create}
  okAction={save}
  okLoading={saving}
  scrollableContent={false}
  {canSave}
  onCancel={close}
>
  <div class="name-block">
    <ModernEditbox
      bind:value={name}
      label={love.string.GroupName}
      size="large"
      kind="ghost"
      autoFocus
      disabled={saving}
      on:keydown={(ev) => {
        if (ev.key === 'Enter') void save()
      }}
    />
    <span class="hint"><Label label={love.string.MeetingGroupHint} /></span>
  </div>

  {#if meetings.length === 0}
    <div class="empty"><Label label={love.string.MeetingGroupNoMeetings} /></div>
  {:else}
    <div class="head">
      <span class="head-label"><Label label={love.string.Meetings} /></span>
      <span class="head-count" data-id="meeting-group-count">
        <Label label={love.string.MeetingGroupSelected} params={{ count: selected.size }} />
      </span>
    </div>
    <div class="list">
      <Scroller padding="0">
        <div class="rows">
          {#each meetings as meeting (meeting._id)}
            {@const groupName = meeting.group !== undefined ? groups.get(meeting.group) : undefined}
            <button
              type="button"
              class="row"
              class:selected={selected.has(meeting._id)}
              data-id="meeting-group-item"
              disabled={saving}
              on:click={() => {
                toggle(meeting._id)
              }}
            >
              <span class="box">
                {#if selected.has(meeting._id)}<Icon icon={ui.icon.Check} size={'small'} />{/if}
              </span>
              <span class="name">
                {#if meeting.name !== undefined && meeting.name !== ''}
                  {meeting.name}
                {:else}
                  <!-- `name` is required by Space, but rows without one exist: they still need a label. -->
                  <Label label={love.string.Meeting} />
                {/if}
              </span>
              {#if groupName !== undefined}
                <span class="tag">{groupName}</span>
              {/if}
            </button>
          {/each}
        </div>
      </Scroller>
    </div>
  {/if}
</Modal>

<style lang="scss">
  // The dialog uses the platform modal chrome, so it only owns the insets and the list look.
  .name-block {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;
    padding: var(--spacing-2) var(--spacing-3) 0;

    // The group name reads as the title of the dialog, not as one more form field.
    :global(input) {
      font-size: 1.125rem;
      font-weight: 500;
    }
  }

  .hint {
    display: block;
    padding: 0 var(--spacing-2) var(--spacing-1);
    color: var(--global-secondary-TextColor, var(--theme-content-color));
    font-size: 0.8125rem;
    line-height: 1.25rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    padding: var(--spacing-4) var(--spacing-3) var(--spacing-1);
  }

  .head-label {
    text-transform: uppercase;
    font-weight: 500;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    color: var(--global-secondary-TextColor, var(--theme-content-color));
  }

  .head-count {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor, var(--theme-content-color));
  }

  // Grows with the list instead of holding a fixed empty frame: one meeting makes a short dialog.
  .list {
    display: flex;
    flex-direction: column;
    max-height: 22rem;
    min-height: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--spacing-2) var(--spacing-3);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    width: 100%;
    padding: var(--spacing-1_5) var(--spacing-2);
    border: 0;
    border-radius: var(--medium-BorderRadius);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--global-ui-hover-BackgroundColor, var(--theme-button-hovered));
    }

    &.selected {
      background: var(--button-selected-BackgroundColor, var(--theme-button-default));
    }

    &:disabled {
      cursor: default;
      opacity: 0.7;
    }
  }

  .box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--spacing-2);
    height: var(--spacing-2);
    border: 1px solid var(--selector-BorderColor);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--selector-BackgroundColor);

    :global(svg) {
      width: 0.75rem;
      height: 0.75rem;
    }
  }

  .row.selected .box {
    border-color: var(--button-primary-BackgroundColor);
    background-color: var(--button-primary-BackgroundColor);
    color: var(--button-primary-LabelColor, #fff);
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    flex-shrink: 0;
    max-width: 40%;
    padding: 0 var(--spacing-1);
    border-radius: var(--extra-small-BorderRadius);
    background: var(--theme-button-default);
    color: var(--global-secondary-TextColor, var(--theme-content-color));
    font-size: 0.75rem;
    line-height: 1.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    margin: var(--spacing-4) var(--spacing-3) var(--spacing-3);
    padding: var(--spacing-4) var(--spacing-2);
    border: 1px dashed var(--global-subtle-ui-BorderColor, var(--theme-divider-color));
    border-radius: var(--medium-BorderRadius);
    color: var(--global-secondary-TextColor, var(--theme-content-color));
    font-size: 0.8125rem;
    text-align: center;
  }
</style>
