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
  import { IconHistory, IconLink, IconMoreH, IconShare } from '@hcengineering/ui'
  import { Breadcrumbs, IconButton, Panel, type ButtonGroupItem, type PanelProps } from '@hcengineering/ui/kit'

  export let props: PanelProps = {}
  export let width: string = '60rem'
  export let withAside: boolean = true
  export let customAsides: boolean = false

  const t = getEmbeddedLabel

  const asides: ButtonGroupItem[] = [
    { id: 'links', icon: IconShare, tooltip: { label: t('Backlinks') } },
    { id: 'history', icon: IconHistory, tooltip: { label: t('History') } }
  ]
</script>

<!-- A frame of a fixed size: the panel fills its container as in the workbench. -->
<div class="panel-example" style:width>
  {#if withAside}
    <Panel {...props} customAside={customAsides ? asides : undefined}>
      <Breadcrumbs slot="title" items={[{ label: t('Website') }, { label: t('WEB-128') }]} />
      <svelte:fragment slot="utils">
        <IconButton icon={IconLink} kind="ghost" size="small" iconSize="medium" tooltip={{ label: t('Copy link') }} />
        <IconButton icon={IconMoreH} kind="ghost" size="small" iconSize="medium" tooltip={{ label: t('More') }} />
      </svelte:fragment>
      <div class="panel-example__content">Content</div>
      <div slot="aside" class="panel-example__aside">Properties</div>
    </Panel>
  {:else}
    <Panel {...props}>
      <Breadcrumbs slot="title" items={[{ label: t('Website') }, { label: t('WEB-128') }]} />
      <div class="panel-example__content">Content</div>
    </Panel>
  {/if}
</div>

<style lang="scss">
  .panel-example {
    display: flex;
    height: 20rem;
    background-color: var(--theme-panel-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-focus-BorderRadius);
    overflow: hidden;

    &__content,
    &__aside {
      padding: var(--spacing-2);
      color: var(--global-secondary-TextColor);
    }
  }
</style>
