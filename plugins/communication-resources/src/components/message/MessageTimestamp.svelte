<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { tooltip } from '@hcengineering/ui'
  import { getDisplayTime } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import { DateFormat } from '../../types'

  export let date: Date
  export let format: DateFormat = DateFormat.Time

  $: fullDate = date.toLocaleString('default', {
    minute: '2-digit',
    hour: 'numeric',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  function formatDate (date: Date, format: DateFormat): string {
    if (format === DateFormat.Time) {
      return getTimeFormat(date)
    }

    return getDisplayTime(date.getTime())
  }

  function getTimeFormat (date: Date): string {
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric' }

    return date.toLocaleTimeString('default', options).split(' ')[0]
  }
</script>

<span use:tooltip={{ label: getEmbeddedLabel(fullDate) }}>
  {formatDate(date, format)}
</span>
