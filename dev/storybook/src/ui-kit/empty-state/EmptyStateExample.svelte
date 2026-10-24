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
  import { IconAdd } from '@hcengineering/ui'
  import { Button, EmptyState, type EmptyStateProps } from '@hcengineering/ui/kit'

  export let props: Partial<EmptyStateProps> = {}
  export let label: EmptyStateProps['label'] = getEmbeddedLabel('No issues yet')
  // Named apart from the add-plate `action` of EmptyState, which passes through.
  export let actions: 'none' | 'button' | 'text' = 'none'
  export let width: string = '28rem'
</script>

<div class="empty-state-example" style:width>
  <EmptyState {label} {...props} {...$$restProps}>
    {#if actions === 'button'}
      <Button kind="tertiary" size="small" icon={IconAdd} label={getEmbeddedLabel('New issue')} />
    {:else if actions === 'text'}
      <Button kind="tertiary" size="extra-small" label={getEmbeddedLabel('Create an application')} />
    {/if}
  </EmptyState>
</div>

<style lang="scss">
  .empty-state-example {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2);
    background-color: var(--theme-panel-color);
    border-radius: var(--small-BorderRadius);
  }
</style>
