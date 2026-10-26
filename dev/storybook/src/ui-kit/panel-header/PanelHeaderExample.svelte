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
  import {
    Breadcrumb,
    Button,
    FilterButton,
    IconButton,
    PanelHeader,
    SearchInput,
    type PanelHeaderProps
  } from '@hcengineering/ui/kit'

  // Storybook adds event_* args for the actions panel: they are not component props.
  export let props: Partial<PanelHeaderProps> = {}
  $: own = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('event_')))
  export let width: string = '56rem'
  export let title: string = 'Issues'
  export let withBefore: boolean = true
  export let withSearch: boolean = true
  export let withExtra: boolean = true
  export let withActions: boolean = true
  export let description: string = ''

  const t = getEmbeddedLabel
</script>

<div class="panel-header-example" style:width>
  <PanelHeader {...own} {...$$restProps} on:close>
    <svelte:fragment slot="before">
      {#if withBefore}
        <IconButton icon={ui.icon.PanelRightLine} kind="ghost" size="small" tooltip={{ label: t('Space') }} />
      {/if}
    </svelte:fragment>
    <Breadcrumb label={t(title)} current />
    <svelte:fragment slot="description">
      {#if description !== ''}<span class="panel-header-example__description">{description}</span>{/if}
    </svelte:fragment>
    <svelte:fragment slot="search">
      {#if withSearch}<SearchInput collapsed size="small" />{/if}
    </svelte:fragment>
    <svelte:fragment slot="extra">
      {#if withExtra}
        <FilterButton categories={[]} size="small" />
        <Button label={t('View options')} kind="ghost" size="small" />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="actions">
      {#if withActions}
        <IconButton icon={ui.icon.DotsHorizontal} kind="ghost" size="small" tooltip={{ label: t('More actions') }} />
        <Button icon={ui.icon.Plus} label={t('New issue')} kind="brand" size="small" />
      {/if}
    </svelte:fragment>
  </PanelHeader>
  <div class="panel-header-example__body" />
</div>

<style lang="scss">
  .panel-header-example {
    display: flex;
    flex-direction: column;
    background-color: var(--theme-comp-header-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);
    overflow: hidden;

    &__description {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
    &__body {
      height: 2.5rem;
      background-color: var(--theme-bg-color);
    }
  }
</style>
