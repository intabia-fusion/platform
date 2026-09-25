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

<script lang="ts">
  import { DateRangeMode, type Timestamp } from '@hcengineering/core'
  import type { MeetingMinutes } from '@hcengineering/love'
  import { DatePresenter } from '@hcengineering/ui'

  export let object: MeetingMinutes | undefined = undefined
  export let value: MeetingMinutes | Timestamp | undefined = undefined

  $: doc = object ?? (typeof value === 'object' ? (value as MeetingMinutes) : undefined)

  $: start =
    doc !== undefined
      ? (doc.startedAt ?? (doc.meetingScheduledDate == null ? doc.createdOn : undefined))
      : (value as Timestamp | undefined)
</script>

  <div class="meeting-start">
    <DatePresenter value={start} mode={DateRangeMode.DATETIME} showIcon={false} />
  </div>

<style lang="scss">
  .meeting-start {
    :global(.datetime-button.link) {
      padding: 0 !important;
      color: var(--theme-content-color) !important;
      background-color: transparent !important;
      border-color: transparent !important;
    }

    :global(.datetime-button.link:hover) {
      color: var(--theme-content-color) !important;
      background-color: transparent !important;
      border-color: transparent !important;
    }
  }
</style>
