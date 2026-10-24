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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onMount } from 'svelte'
  import { fade } from 'svelte/transition'

  import IconClose from '../../components/icons/Close.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import StatusIcon from '../status-icon/StatusIcon.svelte'
  import type { StatusIconTone } from '../status-icon/types'
  import type { ToastEvents, ToastProps, ToastTone } from './types'

  type $$Props = ToastProps
  type $$Events = ToastEvents

  export let title: IntlString
  export let titleParams: Record<string, any> = {}
  export let tone: ToastTone | undefined = undefined
  export let closable: boolean = false

  const dispatch = createEventDispatcher<{ close: null }>()

  $: alert = tone === 'error' || tone === 'warning'

  // A polite live region inserted together with its text is often not read: the text follows the region.
  let settled = false
  onMount(() => {
    const timer = setTimeout(() => {
      settled = true
    }, 0)
    return () => {
      clearTimeout(timer)
    }
  })

  const icons: Record<ToastTone, StatusIconTone> = {
    info: 'info',
    success: 'positive',
    warning: 'warning',
    error: 'error'
  }
</script>

<div class="toast" role={alert ? 'alert' : 'status'} in:fade out:fade>
  {#if settled || alert}
    <div class="toast__header">
      {#if tone !== undefined}
        <!-- Info is only news: a ring keeps it quieter than a result or a problem. -->
        <StatusIcon tone={icons[tone]} kind={tone === 'info' ? 'outline' : 'solid'} size="medium" />
      {/if}
      <span class="toast__title"><slot name="title"><Label label={title} params={titleParams} /></slot></span>
      {#if closable}
        <IconButton
          icon={IconClose}
          kind="ghost"
          size="small"
          tooltip={{ label: ui.string.Close }}
          data-id="btnNotifyClose"
          on:click={() => {
            dispatch('close', null)
          }}
        />
      {/if}
    </div>
    {#if $$slots.default}
      <div class="toast__content"><slot /></div>
    {/if}
    {#if $$slots.actions}
      <div class="toast__actions"><slot name="actions" /></div>
    {/if}
  {/if}
</div>

<style lang="scss">
  .toast {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1_5);
    overflow: hidden;
    // A phone is narrower than the card: it shrinks to the window.
    min-width: min(25rem, calc(100vw - 2rem));
    max-width: min(35rem, calc(100vw - 2rem));
    padding: var(--spacing-1_5);
    color: var(--global-primary-TextColor);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--medium-BorderRadius);
    box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
      var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);

    &__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-width: 0;
      // Keeps the title row as tall as the close button, with or without it.
      min-height: var(--global-small-Size);
    }
    &__title {
      flex-grow: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.5rem;
    }
    &__content {
      min-width: 0;
      font-size: 0.875rem;
      line-height: 1.25rem;
    }
    &__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-1);
    }
  }
</style>
