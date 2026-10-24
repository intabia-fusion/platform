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
  import type { NavGroupProps } from '../../ui-kit/nav-group/types'
  import NavGroup from '../../ui-kit/nav-group/NavGroup.svelte'

  export let props: NavGroupProps
  export let collapsed: boolean = false
</script>

<NavGroup {...props} on:toggle on:select>
  <button slot="tools" class="tool" type="button">Add</button>
  <span slot="extra" class="extra">Project</span>
  <p class="content">Item</p>
  <svelte:fragment slot="collapsed">
    {#if collapsed}<p class="selected-child">Selected</p>{/if}
  </svelte:fragment>
</NavGroup>
