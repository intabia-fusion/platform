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
  // Type-level checks of Dropdown bindings. svelte-check enforces them: tsc sees .svelte imports as any.
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import Dropdown from '../../ui-kit/dropdown/Dropdown.svelte'
  import type { DropdownItem } from '../../ui-kit/dropdown/types'

  type Mode = 'list' | 'board'

  const items: Array<DropdownItem<Mode>> = [
    { id: 'list', label: getEmbeddedLabel('List') },
    { id: 'board', label: getEmbeddedLabel('Board') }
  ]

  let mode: Mode = 'list'
  let modes: Mode[] = []

  function onMode (value: Mode): void {
    mode = value
  }
  function onModes (value: Mode[]): void {
    modes = value
  }
</script>

<Dropdown
  {items}
  bind:selected={mode}
  on:selected={(e) => {
    onMode(e.detail)
  }}
/>
<Dropdown
  {items}
  multiselect
  bind:selected={modes}
  on:selected={(e) => {
    onModes(e.detail)
  }}
/>
