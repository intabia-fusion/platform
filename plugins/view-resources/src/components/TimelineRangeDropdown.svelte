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
  import { DropdownLabels, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { timelineRanges } from '../timeline'

  export let value: number

  const dispatch = createEventDispatcher<{ change: number }>()

  $: monthsFormat = new Intl.NumberFormat($themeStore.language, { style: 'unit', unit: 'month', unitDisplay: 'long' })
  $: ranges = timelineRanges.map((it) => ({ id: it, label: monthsFormat.format(it) }))
</script>

<DropdownLabels
  items={ranges}
  selected={value}
  kind={'ghost'}
  size={'small'}
  dataId={'timeline-range'}
  on:selected={(e) => {
    dispatch('change', e.detail)
  }}
/>
