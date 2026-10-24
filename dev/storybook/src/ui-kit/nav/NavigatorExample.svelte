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
  import {
    IconActivity,
    IconAdd,
    IconColStar,
    IconFile,
    IconFolder,
    IconMoreH,
    IconSettings,
    IconThread
  } from '@hcengineering/ui'
  import { IconButton, NavGroup, NavItem } from '@hcengineering/ui/kit'

  const t = getEmbeddedLabel

  let selected = 'inbox'
  let openSpec = true
  let openDocs = false

  function pick (id: string): () => void {
    return () => {
      selected = id
    }
  }
</script>

<div class="navigator-example">
  <div class="navigator-example__items">
    <NavItem
      label={t('Inbox')}
      icon={IconActivity}
      count={12}
      selected={selected === 'inbox'}
      on:click={pick('inbox')}
    />
    <NavItem label={t('Threads')} icon={IconThread} selected={selected === 'threads'} on:click={pick('threads')} />
    <NavItem label={t('Settings')} icon={IconSettings} disabled />
  </div>

  <NavGroup label={t('Starred')} expandable highlighted={selected.startsWith('star')}>
    <svelte:fragment slot="tools">
      <IconButton icon={IconMoreH} kind="ghost" size="extra-small" tooltip={{ label: t('More actions') }} />
    </svelte:fragment>
    <div class="navigator-example__items">
      <NavItem
        label={t('general')}
        count={42}
        icon={IconColStar}
        kind="object"
        selected={selected === 'star-general'}
        on:click={pick('star-general')}
      >
        <svelte:fragment slot="actions">
          <IconButton icon={IconMoreH} kind="ghost" size="extra-small" tooltip={{ label: t('More actions') }} />
        </svelte:fragment>
      </NavItem>
      <NavItem label={t('Urgent')} color="#F96E50" selected={selected === 'star-tag'} on:click={pick('star-tag')} />
    </div>
  </NavGroup>

  <NavGroup label={t('Teamspaces')} expandable highlighted={selected.startsWith('doc')}>
    <svelte:fragment slot="tools">
      <IconButton icon={IconAdd} kind="ghost" size="extra-small" tooltip={{ label: t('New teamspace') }} />
    </svelte:fragment>
    <NavGroup label={t('Product')} kind="nested" icon={IconFolder} expandable>
      <div class="navigator-example__items">
        <NavItem
          label={t('Specification')}
          icon={IconFile}
          expandable
          bind:open={openSpec}
          selected={selected === 'doc-spec'}
          on:click={pick('doc-spec')}
        >
          <svelte:fragment slot="children">
            <NavItem
              label={t('Requirements with a long title that is cut')}
              icon={IconFile}
              level={1}
              expandable
              empty
              selected={selected === 'doc-req'}
              on:click={pick('doc-req')}
            />
            <NavItem
              label={t('Design')}
              icon={IconFile}
              level={1}
              expandable
              bind:open={openDocs}
              on:click={pick('doc-design')}
            >
              <svelte:fragment slot="children">
                <NavItem label={t('Mockups')} icon={IconFile} level={2} expandable empty />
              </svelte:fragment>
            </NavItem>
          </svelte:fragment>
        </NavItem>
        <NavItem label={t('Roadmap')} icon={IconFile} expandable empty on:click={pick('doc-roadmap')} />
      </div>
    </NavGroup>
    <NavGroup
      label={t('Drive')}
      kind="nested"
      icon={IconFolder}
      expandable
      selected={selected === 'drive'}
      on:select={pick('drive')}
    >
      <div class="navigator-example__items">
        <NavItem label={t('Contracts')} icon={IconFolder} expandable empty />
      </div>
    </NavGroup>
  </NavGroup>

  <NavGroup label={t('On this page')} divider>
    <div class="navigator-example__anchors">
      <NavItem kind="anchor" label={t('General')} />
      <NavItem kind="anchor" label={t('Attributes')} />
      <NavItem kind="anchor" label={t('Statuses')} />
    </div>
  </NavGroup>
</div>

<style lang="scss">
  .navigator-example {
    display: flex;
    flex-direction: column;
    width: 16rem;
    padding: var(--spacing-1) 0;
    background-color: var(--theme-navpanel-color);
    border: 1px solid var(--theme-navpanel-border, transparent);
    border-radius: var(--small-BorderRadius);

    &__items,
    &__anchors {
      display: flex;
      flex-direction: column;
      margin: 0 var(--spacing-1_5);
    }
    &__items:first-child {
      margin-bottom: var(--spacing-1_5);
    }
  }
</style>
