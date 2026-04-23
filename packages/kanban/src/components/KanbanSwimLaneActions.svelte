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
  import type { IntlString } from '@hcengineering/platform'
  import { IconChevronDown, IconChevronRight, Switcher } from '@hcengineering/ui'
  import { swimLaneControlStore } from '../swimlane'

  export let viewlet: { _id: string } | undefined = undefined
  export let config: { collapseLabel?: IntlString, expandLabel?: IntlString } = {}

  $: controls = viewlet != null ? $swimLaneControlStore.get(viewlet._id) : undefined

  $: items = [
    {
      id: 'collapse',
      icon: IconChevronRight,
      labelIntl: config.collapseLabel,
      tooltip: config.collapseLabel,
      action: () => controls?.collapseAll()
    },
    {
      id: 'expand',
      icon: IconChevronDown,
      labelIntl: config.expandLabel,
      tooltip: config.expandLabel,
      action: () => controls?.expandAll()
    }
  ]
</script>

{#if controls != null}
  <Switcher
    name={'kanbanSwimLaneActions'}
    {items}
    selected={''}
    kind={'subtle'}
    onlyIcons
    on:select={(e) => {
      if (e.detail?.action != null) e.detail.action()
    }}
  />
{/if}
