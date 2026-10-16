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
  import type { Issue, IssueStatus } from '@hcengineering/tracker'
  import { resizeObserver, type ColorDefinition } from '@hcengineering/ui'
  import type { ViewOptions } from '@hcengineering/view'
  import { statusStore } from '@hcengineering/view-resources'
  import IssueStatusIcon from '../IssueStatusIcon.svelte'

  export let value: Issue
  export let viewOptions: ViewOptions | undefined = undefined

  $: status = $statusStore.byId.get(value.status) as IssueStatus | undefined

  let color: ColorDefinition | undefined
  let fits = true
</script>

{#if viewOptions?.shouldShowColors !== false}
  <div class="fill" style:background-color={color?.color} />
{/if}
<!-- Rendered only for its accent color, the bar shows no icon. -->
<div class="hidden-icon">
  <IssueStatusIcon
    value={status}
    taskType={value.kind}
    space={value.space}
    size={'small'}
    on:accent-color={(e) => {
      color = e.detail
    }}
  />
</div>
<span
  class="label"
  class:clipped={!fits}
  use:resizeObserver={(el) => {
    fits = el.scrollWidth <= el.clientWidth
  }}
>
  {value.identifier}
</span>

<style lang="scss">
  .fill {
    position: absolute;
    inset: 0;
    opacity: 0.25;
    pointer-events: none;
  }
  .hidden-icon {
    display: none;
  }
  .label {
    position: relative;
    z-index: 2;
    overflow: hidden;
    min-width: 0;
    white-space: nowrap;

    &.clipped {
      visibility: hidden;
    }
  }
</style>
