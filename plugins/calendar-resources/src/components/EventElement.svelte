<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
<script lang="ts">
  import type { CalendarEventPresenter, Event } from '@hcengineering/calendar'
  import calendar from '@hcengineering/calendar'
  import type { Doc } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { ComponentExtensions } from '@hcengineering/presentation'
  import ui, { Component, Icon, MILLISECONDS_IN_MINUTE, showPopup, tooltip } from '@hcengineering/ui'
  import { showMenu } from '@hcengineering/view-resources'
  import { calendarByIdStore, isVisible } from '../utils'
  import EventPresenter from './EventPresenter.svelte'

  export let event: Event
  export let size: { width: number, height: number }

  $: oneRow = size.height < 42 || event.allDay
  $: narrow = event.dueDate - event.date < MILLISECONDS_IN_MINUTE * 25
  $: empty = size.width < 44

  // The calendar's own editor, which is the popup the event has always been edited in. A meeting is
  // not a special case here: its block (room, link, "Start meeting") is added to that very editor by
  // the love plugin through `calendar.extensions.EditEventExtensions`.
  // `center` and not `content`: only a position that shows the modal overlay gives the window a click
  // outside it - `content` docks the popup to the content panel with no overlay, so only the close
  // button and Esc can dismiss it.
  function click (): void {
    if (!visible) return
    showPopup(calendar.component.EditEvent, { object: event }, 'center')
  }

  const client = getClient()
  const hierarchy = client.getHierarchy()
  $: presenter = hierarchy.classHierarchyMixin<Doc, CalendarEventPresenter>(
    event._class,
    calendar.mixin.CalendarEventPresenter
  )

  let div: HTMLDivElement

  $: visible = isVisible(event, $calendarByIdStore)

  // The answer of this person for the event, marked on the tile itself: the calendar is where the
  // question is read, and the answer used to be visible only after opening the event.
  $: rsvpIcon =
    event.rsvp === 'accepted'
      ? ui.icon.CheckCircle
      : event.rsvp === 'declined'
        ? ui.icon.CrossCircle
        : ui.icon.Clock
  $: rsvpLabel =
    event.rsvp === 'accepted'
      ? calendar.string.RsvpAccepted
      : event.rsvp === 'declined'
        ? calendar.string.RsvpDeclined
        : calendar.string.RsvpTentative

  function contextMenu (e: MouseEvent): void {
    showMenu(e, { object: event })
  }
</script>

{#if event}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    bind:this={div}
    class="event-container"
    class:oneRow
    class:empty
    use:tooltip={{ component: EventPresenter, props: { value: event, hideDetails: !visible } }}
    on:click|stopPropagation={click}
    on:contextmenu={contextMenu}
  >
    {#if !empty && presenter?.presenter}
      <Component is={presenter.presenter} props={{ event, narrow, oneRow, hideDetails: !visible }} />
    {/if}
    <!-- Another plugin may mark the card (a meeting, for one). Rendered as an overlay so it does
         not take a row from the presenter, which fills the whole card. -->
    {#if !empty}
      <div class="event-card-extensions">
        <ComponentExtensions
          extension={calendar.extensions.EventCardExtensions}
          props={{ event, narrow, oneRow, hideDetails: !visible }}
        />
      </div>
    {/if}
    {#if !empty && event.rsvp !== undefined}
      <div class="event-rsvp" use:tooltip={{ label: rsvpLabel }}>
        <Icon icon={rsvpIcon} size="x-small" />
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .event-container {
    pointer-events: auto;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    font-size: 0.8125rem;
    background-color: var(--calendar-event-back-color);
    border: 1px solid var(--calendar-event-border-color);
    border-left: 0.25rem solid var(--calendar-event-handle-color);
    border-radius: 0.25rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem 0.25rem 1rem;
  }

  .event-card-extensions {
    position: absolute;
    top: 0.125rem;
    right: 0.25rem;
    display: flex;
    align-items: center;
  }

  // Bottom corner: the top one carries the plugin marks (a meeting has three of them).
  .event-rsvp {
    position: absolute;
    bottom: 0.125rem;
    right: 0.25rem;
    display: flex;
    color: var(--theme-content-color);
  }
</style>
