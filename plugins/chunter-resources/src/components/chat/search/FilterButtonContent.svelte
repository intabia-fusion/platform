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
  import { Icon, Label, type IconComponent } from '@hcengineering/ui'

  import chunter from '../../../plugin'

  export let title: string
  export let icon: IconComponent | undefined = undefined
  export let count: number = 1
</script>

<span class="content flex-row-center flex-gap-1 overflow-label">
  {#if icon !== undefined}
    <Icon {icon} size={'small'} />
  {/if}
  <span class="title overflow-label">{title}</span>
  {#if count > 1}
    <span class="counter"><Label label={chunter.string.SearchFilterMoreClasses} params={{ count: count - 1 }} /></span>
  {/if}
</span>

<style lang="scss">
  .title {
    max-width: 8rem;
  }

  .counter {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 var(--spacing-0_5);
    height: 1rem;
    color: var(--theme-darker-color);
    background-color: var(--theme-button-hovered);
    border-radius: var(--extra-small-BorderRadius);
    font-size: 0.6875rem;
    line-height: 1;
  }
</style>
