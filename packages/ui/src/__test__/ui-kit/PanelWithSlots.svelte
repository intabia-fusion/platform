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
  import type { ButtonGroupItem } from '../../ui-kit/button-group/types'
  import Panel from '../../ui-kit/panel/Panel.svelte'
  import type { PanelProps } from '../../ui-kit/panel/types'

  export let props: PanelProps
  export let withAside: boolean = true
  export let withBefore: boolean = false
  export let customAside: ButtonGroupItem[] | undefined = undefined
  export let panel: Panel | undefined = undefined
</script>

{#if withAside}
  <Panel bind:this={panel} {...props} {customAside} on:close on:select on:open on:maxWidth>
    <span slot="title" class="title">Issue</span>
    <button slot="utils" class="util" type="button">Copy</button>
    <div class="content">Body</div>
    <div slot="aside" class="aside">Properties</div>
  </Panel>
{:else if withBefore}
  <Panel bind:this={panel} {...props} on:close>
    <button slot="before" class="before" type="button">Back</button>
    <span slot="title" class="title">Issue</span>
    <div class="content">Body</div>
  </Panel>
{:else}
  <Panel bind:this={panel} {...props} on:close>
    <span slot="title" class="title">Issue</span>
    <div class="content">Body</div>
  </Panel>
{/if}
