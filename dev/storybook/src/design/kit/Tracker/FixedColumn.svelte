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
  import { fixedColumns } from './fixedColumns'

  export let key: string
  export let justify: 'left' | 'right' | '' = ''

  const widths = fixedColumns()
  let width = 0
  // Like view-resources FixedColumn: the column only grows to its widest cell
  $: if (width > ($widths[key] ?? 0)) $widths[key] = width
</script>

<div
  class="flex-no-shrink"
  style:text-align={justify !== '' ? justify : undefined}
  style:min-width="{$widths[key] ?? 0}px"
  bind:clientWidth={width}
>
  <slot />
</div>
