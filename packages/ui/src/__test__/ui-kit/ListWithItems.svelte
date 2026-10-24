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
  import type { ListProps } from '../../ui-kit/list/types'
  import List from '../../ui-kit/list/List.svelte'

  export let props: ListProps<string>
  let list: List | undefined

  export function select (pos: number): void {
    list?.select(pos)
  }

  export function onKeydown (event: KeyboardEvent): boolean {
    return list?.onKeydown(event) ?? false
  }
</script>

<List bind:this={list} {...props} on:select on:activate>
  <span slot="item" class="value" let:value let:index>{index}:{value}</span>
  <svelte:fragment slot="category" let:index
    >{#if index === 2}<span class="category">Group</span>{/if}</svelte:fragment
  >
</List>
