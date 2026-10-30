<!--
// Copyright © 2026 Intabia Fusion.
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
  import ui, { CheckBox, Component, Label, languageStore, showPopup, Spinner } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import notification from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import view from '@hcengineering/view'
  import { contextPreview, Menu, previewTitle } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'
  import type { WithLookup } from '@hcengineering/core'
  import { AccountRole, getCurrentAccount } from '@hcengineering/core'

  import NotifyContextIcon from './NotifyContextIcon.svelte'

  export let value: WithLookup<DocNotifyContext>
  export let isClearing = false

  const account = getCurrentAccount()
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const dispatch = createEventDispatcher()

  let isActionMenuOpened = false

  $: presenterMixin = hierarchy.classHierarchyMixin(value.objectClass, notification.mixin.NotificationContextPresenter)

  function showMenu (ev: MouseEvent): void {
    showPopup(
      Menu,
      {
        object: value,
        baseMenuClass: notification.class.DocNotifyContext,
        excludedActions: [],
        mode: 'panel'
      },
      ev.target as HTMLElement,
      handleActionMenuClosed
    )
    handleActionMenuOpened()
  }

  function handleActionMenuOpened (): void {
    isActionMenuOpened = true
  }

  function handleActionMenuClosed (): void {
    isActionMenuOpened = false
  }

  async function checkContext (): Promise<void> {
    dispatch('clear')
  }
  $: previewStore = contextPreview(value)
  $: preview = $previewStore

  $: identifier = preview?.identifier
  // The label is drawn before the title, so a title-less preview stays empty here
  $: titleStore = previewTitle(client, preview, $languageStore, false)
  $: title = $titleStore
</script>

<div class="header">
  <NotifyContextIcon {value} />
  <div class="labels">
    {#if presenterMixin?.labelPresenter}
      <Component is={presenterMixin.labelPresenter} props={{ context: value }} />
    {:else}
      {#if identifier}
        {identifier}
      {:else}
        <Label label={preview?.label ?? hierarchy.getClass(preview?.objectClass ?? value.objectClass).label} />
      {/if}
      <span class="title overflow-label clear-mins" {title}>
        {title}
      </span>
    {/if}
  </div>

  <div class="actions clear-mins">
    <div class="flex-center min-w-6">
      {#if isClearing}
        <Spinner size="small" />
      {:else if account.role !== AccountRole.ReadOnlyGuest}
        <CheckBox checked={false} kind="todo" size="medium" on:value={checkContext} />
      {/if}
    </div>
    <IconButton
      icon={ui.icon.DotsVertical}
      size="small"
      kind="tertiary"
      inheritColor
      pressed={isActionMenuOpened}
      tooltip={{ label: view.string.MoreActions }}
      on:click={showMenu}
    />
  </div>
</div>

<style lang="scss">
  .header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: var(--spacing-0_5);
    padding-top: var(--spacing-1_5);
    height: 3.625rem;

    .actions {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      top: 0.5rem;
      right: 0.25rem;
      gap: 0.25rem;
      color: var(--global-secondary-TextColor);
    }
  }

  .title {
    font-weight: 400;
    color: var(--global-primary-TextColor);
    min-width: 0;
    margin-right: 1rem;
  }

  .labels {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: var(--global-primary-TextColor);
    font-weight: 600;
    font-size: 0.875rem;
    gap: 0.25rem;
    min-width: 0;
    overflow: hidden;
    margin-right: 4rem;
  }
</style>
