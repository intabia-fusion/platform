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
  import type { Asset, IntlString } from '@hcengineering/platform'
  import type { EmptyStateAction } from '../types'

  import { deviceOptionsStore as deviceInfo, setNavigatorVisible } from '..'
  import ui from '../plugin'
  import Icon from './Icon.svelte'
  import Label from './Label.svelte'

  export let icon: Asset | undefined = undefined
  export let title: IntlString
  export let titleParams: Record<string, any> = {}
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> = {}
  export let actions: EmptyStateAction[] = []
  // Things to open (recent spaces, active chats): one per line, above the actions line.
  export let choices: EmptyStateAction[] = []

  $: navigatorHidden = !$deviceInfo.navigator.visible && !$deviceInfo.navigator.float

  // The "show menu" link rides the same actions line as the caller's own actions.
  $: allActions = navigatorHidden
    ? [
        ...actions,
        {
          label: ui.string.ShowMenu,
          onClick: () => {
            setNavigatorVisible(true)
          }
        }
      ]
    : actions

  // Headers above the list differ per view (one or two rows), so center on the whole content panel,
  // not on the list area, to keep the card in place when switching views.
  let shift = 0
  function alignToPanel (node: HTMLElement): { destroy: () => void } {
    const update = (): void => {
      const panel = node.closest('[data-id="contentPanel"]')
      const card = node.firstElementChild
      if (panel == null || card == null) return
      const p = panel.getBoundingClientRect()
      const n = node.getBoundingClientRect()
      const wanted = (p.top + p.bottom - n.top - n.bottom) / 2
      const limit = Math.max(0, (n.height - card.getBoundingClientRect().height) / 2 - 16)
      shift = Math.max(-limit, Math.min(limit, wanted))
    }
    const observer = new ResizeObserver(update)
    observer.observe(node)
    update()
    return {
      destroy: () => {
        observer.disconnect()
      }
    }
  }

  // Links, not buttons: they read as text links and don't collide with the view's own buttons.
  function onLinkKey (e: KeyboardEvent, link: EmptyStateAction): void {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    link.onClick()
  }
</script>

<div class="emptyState flex-center" use:alignToPanel>
  <div class="emptyState-card flex-col-center" style:transform={shift !== 0 ? `translateY(${shift}px)` : undefined}>
    {#if icon !== undefined}
      <div class="flex-center content-dark-color">
        <Icon {icon} size="large" />
      </div>
    {/if}
    <span class="text-sm font-medium caption-color" class:mt-3={icon !== undefined}>
      <Label label={title} params={titleParams} />
    </span>
    {#if description !== undefined}
      <span class="text-sm content-color mt-2">
        <Label label={description} params={descriptionParams} />
      </span>
    {/if}
    {#if navigatorHidden}
      <span class="text-sm content-color mt-2">
        <Label label={ui.string.NavigatorHidden} />
      </span>
    {/if}
    {#if choices.length > 0}
      <div class="emptyState-choices mt-4">
        {#each choices as choice, i (i)}
          <span
            class="emptyState-link"
            role="link"
            tabindex="0"
            on:click={choice.onClick}
            on:keydown={(e) => {
              onLinkKey(e, choice)
            }}
          >
            {#if choice.label !== undefined}
              <Label label={choice.label} params={choice.labelParams ?? {}} />
            {:else}
              {choice.title}
            {/if}
          </span>
        {/each}
      </div>
    {/if}
    {#if allActions.length > 0}
      <div class="emptyState-actions mt-4">
        {#each allActions as action, i (i)}
          {#if i > 0}<span class="content-dark-color">·</span>{/if}
          <span
            class="emptyState-link"
            role="link"
            tabindex="0"
            on:click={action.onClick}
            on:keydown={(e) => {
              onLinkKey(e, action)
            }}
          >
            {#if action.label !== undefined}
              <Label label={action.label} params={action.labelParams ?? {}} />
            {:else}
              {action.title}
            {/if}
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .emptyState {
    flex-grow: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 1rem;
    // Overlay-only layer: the card below carries the visuals and click handling.
    pointer-events: none;
  }

  .emptyState-card {
    max-width: 30rem;
    padding: 1.5rem 2rem;
    border: 1px dashed var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-list-row-color);
    text-align: center;
    text-wrap: balance;
    pointer-events: auto;
  }

  .emptyState-choices {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
  }

  .emptyState-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    row-gap: 0.25rem;
    column-gap: 0.375rem;
  }

  .emptyState-link {
    all: unset;
    cursor: pointer;
    color: var(--theme-link-color);

    &:hover {
      text-decoration: underline;
    }
    &:focus-visible {
      outline: 1px solid var(--theme-link-color);
      outline-offset: 2px;
      border-radius: 0.125rem;
    }
  }
</style>
