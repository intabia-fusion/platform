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
  import { Label } from '@hcengineering/ui'
  import { Dropdown, type DropdownItem } from '@hcengineering/ui/kit'

  import ExampleIcon from '../select-button/ExampleIcon.svelte'
  import ExampleTransition from './ExampleTransition.svelte'

  const t = getEmbeddedLabel
  const statuses: DropdownItem[] = [
    { id: 'backlog', label: t('Backlog'), icon: ExampleIcon, iconProps: { glyph: 'backlog' }, heading: t('Backlog') },
    { id: 'todo', label: t('Todo'), icon: ExampleIcon, iconProps: { glyph: 'backlog' }, heading: t('Unstarted') },
    {
      id: 'progress',
      label: t('In progress'),
      icon: ExampleIcon,
      iconProps: { glyph: 'progress' },
      heading: t('Started')
    },
    { id: 'review', label: t('In review'), icon: ExampleIcon, iconProps: { glyph: 'progress' } },
    { id: 'testing', label: t('Ready for testing'), icon: ExampleIcon, iconProps: { glyph: 'progress' } }
  ]
  const placeholder = t('No statuses')

  const transitions: DropdownItem[] = [
    { id: 'start', name: 'Start', from: ['backlog'], to: 'progress' },
    { id: 'reopen', name: 'Reopen', from: ['progress', 'progress'], to: 'backlog' }
  ].map(({ id, ...props }) => ({ id, label: t(props.name), component: ExampleTransition, componentProps: props }))

  let shown = ['backlog', 'todo', 'progress', 'review', 'testing']
  let transition = 'start'
  let filter = ['progress', 'review']
</script>

<div class="examples">
  <div class="caption">value slot + wrap: свои чипы, длинный список переносится (место 20rem)</div>
  <div class="place">
    <Dropdown items={statuses} bind:selected={shown} multiselect wrap fullWidth {placeholder}>
      <span slot="value" class="chips" let:items>
        {#each items as item (item.id)}
          <span class="chip"><ExampleIcon {...item.iconProps} /><Label label={item.label} /></span>
        {/each}
      </span>
    </Dropdown>
  </div>

  <div class="caption">value slot без wrap: обрезается</div>
  <div class="place">
    <Dropdown items={statuses} bind:selected={shown} multiselect fullWidth {placeholder}>
      <span slot="value" class="chips chips--line" let:items>
        {#each items as item (item.id)}
          <span class="chip"><ExampleIcon {...item.iconProps} /><Label label={item.label} /></span>
        {/each}
      </span>
    </Dropdown>
  </div>

  <div class="caption">component в пунктах + тот же компонент в value slot, popupWidth wide</div>
  <div class="place">
    <Dropdown items={transitions} bind:selected={transition} fullWidth popupWidth="wide">
      <svelte:fragment slot="value" let:items>
        {#if items[0]?.component !== undefined}
          <svelte:component this={items[0].component} {...items[0].componentProps} />
        {/if}
      </svelte:fragment>
    </Dropdown>
  </div>

  <div class="caption">value slot: первый выбранный и счётчик (фильтр)</div>
  <div>
    <Dropdown items={statuses} bind:selected={filter} multiselect placeholder={t('Status')}>
      <span slot="value" class="first" let:items>
        <ExampleIcon {...items[0]?.iconProps} />
        <Label label={items[0]?.label} />
        {#if items.length > 1}<span class="count">+{items.length - 1}</span>{/if}
      </span>
    </Dropdown>
  </div>
</div>

<style lang="scss">
  .examples {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }
  .caption {
    margin-top: var(--spacing-1);
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .place {
    width: 20rem;
    outline: 1px dashed var(--theme-divider-color);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-0_5) var(--spacing-1);
    min-width: 0;

    &--line {
      flex-wrap: nowrap;
      overflow: hidden;
    }
  }
  .chip,
  .first {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-0_5);
    white-space: nowrap;
  }
  .count {
    color: var(--global-secondary-TextColor);
  }
</style>
