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
  import { Button, IconBack, IconForward, themeStore } from '@hcengineering/ui'
  import { startOfMonth, timelineMonthStore, timelineRangeStore } from '../timeline'
  import TimelineRangeDropdown from './TimelineRangeDropdown.svelte'

  function shift (months: number): void {
    const d = new Date($timelineMonthStore)
    timelineMonthStore.set(new Date(d.getFullYear(), d.getMonth() + months, 1).getTime())
  }

  $: label = new Intl.DateTimeFormat($themeStore.language, { month: 'long', year: 'numeric' }).format(
    $timelineMonthStore
  )
</script>

<div class="flex-row-center flex-gap-1">
  <Button
    icon={IconBack}
    kind={'ghost'}
    size={'small'}
    dataId={'timeline-month-prev'}
    on:click={() => {
      shift(-1)
    }}
  />
  <Button
    label={undefined}
    kind={'ghost'}
    size={'small'}
    on:click={() => {
      timelineMonthStore.set(startOfMonth(Date.now()))
    }}
  >
    <span slot="content" class="month" data-id="timeline-month-label">{label}</span>
  </Button>
  <Button
    icon={IconForward}
    kind={'ghost'}
    size={'small'}
    dataId={'timeline-month-next'}
    on:click={() => {
      shift(1)
    }}
  />
  <TimelineRangeDropdown
    value={$timelineRangeStore}
    on:change={(e) => {
      timelineRangeStore.set(e.detail)
    }}
  />
</div>

<style lang="scss">
  .month {
    min-width: 8rem;
    text-align: center;
  }
</style>
