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
  import ui, { Icon } from '@hcengineering/ui'
  import { WorkbenchTab } from '@hcengineering/ui/kit'

  let docs = [
    { id: 'a', name: 'Release plan', icon: ui.icon.File, pinned: true },
    { id: 'b', name: 'TSK-1204 Rework notifications', icon: ui.icon.PanelRightLine, pinned: false },
    { id: 'c', name: 'General', icon: ui.icon.Bubble, pinned: false },
    { id: 'd', name: 'A very long document title that does not fit', icon: ui.icon.File, pinned: false }
  ]
  let current = 'b'

  const widgets = [
    { id: 'w1', name: 'Thread: design review', icon: ui.icon.Bubble, pinned: true, preview: false },
    { id: 'w2', name: 'Activity', icon: ui.icon.ChartSquare, pinned: false, preview: false },
    { id: 'w3', name: 'Opened from search', icon: ui.icon.File, pinned: false, preview: true }
  ]
  let widget = 'w2'
  let lastMenu = ''
</script>

<div class="strips">
  <div class="caption">
    Полоса workbench: место держит role="tablist" и ширину вкладки (12rem); стрелки ходят по полосе и открывают вкладку,
    Delete закрывает.
  </div>
  <div class="strip" role="tablist" aria-label="Open tabs">
    {#each docs as doc (doc.id)}
      <div class="strip__item">
        <WorkbenchTab
          label={getEmbeddedLabel(doc.name)}
          icon={doc.icon}
          selected={current === doc.id}
          closable={!doc.pinned && docs.length > 1}
          on:click={() => {
            current = doc.id
          }}
          on:close={() => {
            docs = docs.filter((it) => it.id !== doc.id)
            if (current === doc.id) current = docs[0]?.id ?? ''
          }}
          on:menu={() => {
            lastMenu = doc.name
          }}
        >
          <svelte:fragment slot="suffix">
            {#if doc.pinned}<Icon icon={ui.icon.PanelRightLine} size="x-small" />{/if}
          </svelte:fragment>
        </WorkbenchTab>
      </div>
    {/each}
  </div>
  <div class="caption">Контекстное меню: {lastMenu === '' ? '-' : lastMenu}</div>

  <div class="caption">Боковая полоса виджета: vertical, закреплённая - outline без закрытия, временная - preview.</div>
  <div class="strip strip--vertical" role="tablist" aria-orientation="vertical" aria-label="Widget tabs">
    {#each widgets as tab (tab.id)}
      <div class="strip__item strip__item--vertical">
        <WorkbenchTab
          label={getEmbeddedLabel(tab.name)}
          icon={tab.icon}
          orientation="vertical"
          kind={tab.pinned ? 'outline' : 'secondary'}
          preview={tab.preview}
          selected={widget === tab.id}
          closable={!tab.pinned}
          on:click={() => {
            widget = tab.id
          }}
        />
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .strips {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }
  .caption {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .strip {
    display: flex;
    align-items: center;
    gap: var(--spacing-0_5);
    margin-bottom: var(--spacing-2);
    padding: var(--spacing-0_5);
    width: 48rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);

    &--vertical {
      flex-direction: column;
      align-items: center;
      width: fit-content;
      height: 30rem;
    }
    &__item {
      display: flex;
      min-width: 0;
      max-width: 12rem;

      &--vertical {
        max-width: none;
        max-height: 13.5rem;
      }
    }
  }
</style>
