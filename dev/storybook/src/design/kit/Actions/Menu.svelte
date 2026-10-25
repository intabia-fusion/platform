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
  // The product Menu shown as a static surface; `hover` of an entry is not drawn, the Menu has no hover prop
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Menu } from '@hcengineering/ui/kit'
  import type { MenuItem } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import { paletteIndex } from '../palette'
  import type { MenuEntry } from '../types'
  import MenuRow from '../demo/MenuRow.svelte'

  export let items: MenuEntry[]
  export let width: number = 260

  function convert (entries: MenuEntry[]): { rows: MenuItem[], selected: string[] } {
    const rows: MenuItem[] = []
    const selected: string[] = []
    let heading: string | undefined
    let divider = false
    for (const entry of entries) {
      if (entry.divider === true) {
        divider = true
        continue
      }
      if (entry.header !== undefined) {
        heading = entry.header
        continue
      }
      const id = `i${rows.length}`
      const label = entry.label ?? ''
      const custom = entry.hint !== undefined || entry.accent === true
      rows.push({
        id,
        label: getEmbeddedLabel(label),
        icon: kitIcon(entry.icon),
        color: entry.color !== undefined ? paletteIndex(entry.color) : undefined,
        description: !custom && entry.description !== undefined ? getEmbeddedLabel(entry.description) : undefined,
        heading: heading !== undefined ? getEmbeddedLabel(heading) : undefined,
        divider: divider || undefined,
        component: custom ? MenuRow : undefined,
        componentProps: custom
          ? { label, description: entry.description, hint: entry.hint, accent: entry.accent === true }
          : undefined
      })
      if (entry.selected === true) selected.push(id)
      heading = undefined
      divider = false
    }
    return { rows, selected }
  }

  let rows: MenuItem[] = []
  let selected: string[] = []
  $: ({ rows, selected } = convert(items))
</script>

<div style:width="{width}px">
  <Menu items={rows} {selected} minWidth="{width}px" autofocus={false} />
</div>
