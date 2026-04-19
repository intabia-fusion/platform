<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { IntlString } from '@hcengineering/platform'
  import { Label, PaletteColorIndexes, Progress, humanReadableFileSize, humanReadableNumbers } from '@hcengineering/ui'
  import plugin from '../plugin'

  export let label: IntlString
  export let value: number
  export let limit: number

  export let kind: 'bytes' | 'items' | 'minutes' = 'bytes'

  $: color = value >= limit ? PaletteColorIndexes.Firework : undefined

  function formatMinutes (minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  function formatValue (v: number): string {
    if (kind === 'bytes') return humanReadableFileSize(v, 10, 0)
    if (kind === 'minutes') return formatMinutes(v)
    return humanReadableNumbers(v, 10, 0)
  }
</script>

<div class="flex-col flex-gap-2">
  <div class="flex-between text-md">
    <span class="pr-2"><Label {label} /></span>
    <span class="flex-row-center flex-gap-1">
      {formatValue(value)}
      <Label label={plugin.string.Of} />
      {formatValue(limit)}
    </span>
  </div>
  <Progress {color} {value} max={limit} fallback={100} />
</div>
