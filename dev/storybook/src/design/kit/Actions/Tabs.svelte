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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Tabs } from '@hcengineering/ui/kit'
  import type { TabsSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let items: Array<string | [string, IconName]>
  // Label of the selected tab
  export let selected: string | undefined = undefined
  export let size: TabsSize | undefined = undefined

  $: tabs = items.map((item) => {
    const [label, icon] = typeof item === 'string' ? [item, undefined] : item
    return { id: label, label: getEmbeddedLabel(label), icon: kitIcon(icon) }
  })
</script>

<Tabs items={tabs} {selected} {size} aria-label="Tabs" />
