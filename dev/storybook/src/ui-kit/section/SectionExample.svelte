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
  import ui from '@hcengineering/ui'
  import { Button, EmptyState, IconButton, Section, type SectionProps } from '@hcengineering/ui/kit'

  export let props: Partial<SectionProps> = {}
  export let label: SectionProps['label'] = getEmbeddedLabel('Members')
  export let withActions: boolean = true
  export let empty: boolean = false
  export let width: string = '28rem'

  const members = ['Anna Smirnova', 'Igor Petrov', 'Maria Ivanova']
</script>

<div class="section-example" style:width>
  <Section {label} {...props} {...$$restProps}>
    <svelte:fragment slot="actions">
      {#if withActions}
        <IconButton
          icon={ui.icon.Sliders}
          kind="ghost"
          size="small"
          tooltip={{ label: getEmbeddedLabel('View settings') }}
        />
        <IconButton icon={ui.icon.Plus} kind="ghost" size="small" tooltip={{ label: getEmbeddedLabel('Add member') }} />
      {/if}
    </svelte:fragment>
    {#if empty}
      <EmptyState size="small" label={getEmbeddedLabel('No members')}>
        <Button kind="tertiary" size="extra-small" label={getEmbeddedLabel('Add member')} />
      </EmptyState>
    {:else}
      <ul class="section-example__list">
        {#each members as member}<li>{member}</li>{/each}
      </ul>
    {/if}
  </Section>
</div>

<style lang="scss">
  .section-example {
    padding: var(--spacing-1) var(--spacing-2) var(--spacing-2);
    background-color: var(--theme-panel-color);
    border-radius: var(--small-BorderRadius);

    &__list {
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--global-primary-TextColor);

      li {
        padding: var(--spacing-0_75) 0;
      }
    }
  }
</style>
