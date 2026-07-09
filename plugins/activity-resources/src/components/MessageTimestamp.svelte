<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import ui, { tooltip, themeStore } from '@hcengineering/ui'
  import { Timestamp } from '@hcengineering/core'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'

  export let date: Timestamp
  export let format: 'short-time' | 'time' | 'full' = 'time'

  async function getFullDisplayTime (date: Timestamp, lang: string): Promise<string> {
    const now = new Date()
    const d = new Date(date)

    const dateStart = new Date(d).setHours(0, 0, 0, 0)
    const today = new Date(now).setHours(0, 0, 0, 0)
    const timeStr = d.toLocaleTimeString(lang, { hour: 'numeric', minute: 'numeric' })

    const diffTime = today - dateStart
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return timeStr
    }

    const separator = ' '

    if (diffDays === 1) {
      const yesterdayWord = await translate(ui.string.Yesterday, {}, lang)
      return `${yesterdayWord}${separator}${timeStr}`
    } else if (diffDays < 7) {
      const dayOfWeek = d.toLocaleDateString(lang, { weekday: 'long' })
      const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)
      return `${capitalizedDay}${separator}${timeStr}`
    } else {
      const day = d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
      const yearStr = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''
      return `${day}${yearStr}${separator}${timeStr}`
    }
  }

  $: fullDate = new Date(date).toLocaleString('default', {
    minute: '2-digit',
    hour: 'numeric',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  function getTime (date: Timestamp, format: 'short-time' | 'time' | 'full'): string {
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric' }

    const t = new Date(date).toLocaleTimeString('default', options)

    if (format === 'short-time') {
      return t.split(' ')[0]
    }

    return t
  }
</script>

<span use:tooltip={{ label: getEmbeddedLabel(fullDate) }}>
  {#if format === 'full'}
    {#await getFullDisplayTime(date, $themeStore.language) then text}
      {text}
    {/await}
  {:else}
    {getTime(date, format)}
  {/if}
</span>
