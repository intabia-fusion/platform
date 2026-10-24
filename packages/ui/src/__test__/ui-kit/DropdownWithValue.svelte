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

  import Dropdown from '../../ui-kit/dropdown/Dropdown.svelte'
  import type { DropdownItem } from '../../ui-kit/dropdown/types'

  export let items: DropdownItem[]
  export let selected: Array<DropdownItem['id']>
</script>

<Dropdown {items} {selected} multiselect wrap placeholder={getEmbeddedLabel('No priority')}>
  <b slot="value" class="custom" let:items={chosen}>{chosen.length} chosen</b>
</Dropdown>
