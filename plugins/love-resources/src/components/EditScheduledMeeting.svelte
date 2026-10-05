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
  Panel header of a scheduled meeting. Time and participants belong to the calendar event and are
  edited there; the rest of the panel is the generic one.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import presentation from '@hcengineering/presentation'
  import { ModernButton, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { joinMeetingBySession } from '../meetings'

  export let object: Event
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()

  onMount(() => {
    dispatch('open', { ignoreKeys: ['title'] })
  })
</script>

<div class="flex-row-center flex-between flex-gap-2 mb-4">
  <div class="title overflow-label flex-grow">{object.title}</div>
  {#if !readonly}
    <ModernButton
      label={presentation.string.Edit}
      size={'small'}
      on:click={() => showPopup(calendar.component.EditEvent, { object }, 'content')}
    />
  {/if}
  <ModernButton
    label={love.string.JoinMeeting}
    size={'large'}
    kind={'primary'}
    on:click={() => {
      void joinMeetingBySession(object.eventId, 'event')
    }}
  />
</div>
<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
</style>
