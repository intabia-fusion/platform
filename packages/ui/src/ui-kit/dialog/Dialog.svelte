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
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'

  import Label from '../../components/Label.svelte'
  import Scroller from '../../components/Scroller.svelte'
  import IconClose from '../../components/icons/Close.svelte'
  import IconMaximize from '../../components/icons/Maximize.svelte'
  import IconMinimize from '../../components/icons/Minimize.svelte'
  import ui from '../../plugin'
  import type { LabelAndProps } from '../../types'
  import Button from '../button/Button.svelte'
  import IconButton from '../button/IconButton.svelte'
  import Kbd from '../kbd/Kbd.svelte'
  import type { DialogEvents, DialogPadding, DialogProps, DialogSlots, DialogSubmitKind, DialogWidth } from './types'

  type $$Props = DialogProps
  type $$Events = DialogEvents
  type $$Slots = DialogSlots

  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let width: DialogWidth | undefined = undefined
  export let padding: DialogPadding | undefined = undefined
  export let scrollable: boolean = true
  export let embedded: boolean = false
  export let closable: boolean = true
  export let closeOnEscape: boolean = false
  export let allowFullSize: boolean = false
  export let fullSize: boolean = false
  export let footer: boolean = true
  export let submitLabel: IntlString = ui.string.Save
  export let submitKind: DialogSubmitKind | undefined = undefined
  export let submitTooltip: LabelAndProps | undefined = undefined
  export let canSubmit: boolean = true
  export let hideSubmit: boolean = false
  export let cancelLabel: IntlString = ui.string.Cancel
  export let hideCancel: boolean = false
  export let loading: boolean = false
  export let submitOnEnter: boolean = false

  const dispatch = createEventDispatcher<{ submit: null, cancel: null, close: null, fullsize: boolean }>()
  const titleId = `dialog-${Math.random().toString(36).slice(2, 10)}-title`
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'

  // Taken before the children mount and autofocus a field: the element to give focus back to.
  const opener = typeof document !== 'undefined' ? document.activeElement : null
  let form: HTMLFormElement | undefined = undefined
  let submitButton: HTMLButtonElement | undefined = undefined
  let enterButton: HTMLButtonElement | undefined = undefined

  $: resolvedWidth = width ?? 'large'
  $: resolvedPadding = padding ?? 'default'
  $: resolvedSubmitKind = submitKind ?? 'brand'
  $: hasTitle = label !== undefined || $$slots.title
  $: hasFooter = footer && (!hideSubmit || !hideCancel || $$slots.footerStart || $$slots.footerActions)
  $: modal = !embedded

  function cancel (): void {
    if (dispatch('cancel', null, { cancelable: true })) dispatch('close', null)
  }

  /**
   * The popup host asks it before closing on Escape or a click outside: a prevented `cancel` keeps the dialog open.
   * A place that wraps the dialog forwards it: `export function canClose () { return dialog.canClose() }`.
   */
  export function canClose (): boolean {
    return dispatch('cancel', null, { cancelable: true })
  }

  function toggleFullSize (): void {
    fullSize = !fullSize
    dispatch('fullsize', fullSize)
  }

  // A plain button in the content submits the form too, so only the dialog's own buttons or a scripted submit count.
  function handleSubmit (event: SubmitEvent): void {
    const submitter = event.submitter
    if (submitter !== null && submitter !== submitButton && submitter !== enterButton) return
    if (hideSubmit || !canSubmit || loading) return
    dispatch('submit', null)
  }

  // Implicit form submission from a field fires a click on the submit button, so Enter is stopped before it.
  function handleKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Enter' || submitOnEnter || event.isComposing) return
    if (event.target instanceof HTMLInputElement) event.preventDefault()
  }

  function handleWindowKeydown (event: KeyboardEvent): void {
    if (!closeOnEscape || event.key !== 'Escape' || event.defaultPrevented) return
    // Escape in a picker opened from the dialog closes the picker only.
    const popup = event.target instanceof Element ? event.target.closest('.popup') : null
    if (popup !== null && form !== undefined && !popup.contains(form)) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }

  // Tab from the last control comes to a guard at the end and goes on from the first one, and back.
  function handleGuardFocus (event: FocusEvent, edge: 'start' | 'end'): void {
    if (form === undefined) return
    // Tab from the dialog itself, focused on open, enters it like Tab from outside.
    const from = event.relatedTarget
    const fromInside = from instanceof Node && from !== form && form.contains(from)
    const toFirst = edge === 'end' ? fromInside : !fromInside
    const items = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('data-focus-guard')
    )
    if (!toFirst) items.reverse()
    for (const item of items) {
      item.focus()
      if (document.activeElement === item) return
    }
    form.focus()
  }

  onMount(() => {
    // Without a field to autofocus, the dialog itself takes focus, so Tab and screen readers start inside it.
    if (embedded || form === undefined || form.contains(document.activeElement) === true) return
    form.focus({ preventScroll: true })
  })

  onDestroy(() => {
    if (embedded || !(opener instanceof HTMLElement) || opener === document.body || !opener.isConnected) return
    const active = document.activeElement
    if (active === null || active === document.body || form?.contains(active) === true) {
      opener.focus({ preventScroll: true })
    }
  })
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<!-- svelte-ignore a11y-no-noninteractive-tabindex (the form has the dialog role whenever it is focusable) -->
<form
  bind:this={form}
  class="dialog dialog--{resolvedWidth}"
  class:dialog--embedded={embedded}
  class:dialog--full-size={fullSize}
  role={modal ? 'dialog' : undefined}
  aria-modal={modal ? 'true' : undefined}
  aria-labelledby={hasTitle ? titleId : undefined}
  tabindex={modal ? -1 : undefined}
  novalidate
  on:submit|preventDefault={handleSubmit}
  on:keydown={handleKeydown}
  {...$$restProps}
>
  {#if submitOnEnter}
    <!-- Enter in a field presses the first submit button: this one, not a plain button in the content, and none while disabled. -->
    <button
      bind:this={enterButton}
      type="submit"
      class="dialog__enter"
      tabindex="-1"
      aria-hidden="true"
      disabled={hideSubmit || !canSubmit || loading}
    />
  {/if}
  {#if modal}
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <span
      class="dialog__guard"
      tabindex="0"
      aria-hidden="true"
      data-focus-guard
      on:focus={(event) => {
        handleGuardFocus(event, 'start')
      }}
    />
  {/if}
  {#if hasTitle || closable || allowFullSize || $$slots.actions}
    <header class="dialog__header">
      <div class="dialog__title" id={titleId}>
        {#if label !== undefined}<span class="dialog__label"><Label {label} params={labelParams} /></span>{/if}
        <slot name="title" />
      </div>
      {#if $$slots.actions || allowFullSize || closable}
        <div class="dialog__tools">
          <span class="dialog__actions"><slot name="actions" /></span>
          {#if allowFullSize}
            <IconButton
              icon={fullSize ? IconMinimize : IconMaximize}
              kind="ghost"
              size="small"
              tooltip={{ label: fullSize ? ui.string.NormalSize : ui.string.FullSize }}
              on:click={toggleFullSize}
            />
          {/if}
          {#if closable}
            {#if $$slots.actions || allowFullSize}
              <span class="dialog__divider" class:dialog__divider--actions={!allowFullSize} aria-hidden="true" />
            {/if}
            {#if modal || closeOnEscape}<span class="dialog__hotkey"><Kbd keys={['Esc']} /></span>{/if}
            <IconButton
              icon={IconClose}
              kind="ghost"
              size="small"
              tooltip={{ label: ui.string.Close }}
              on:click={cancel}
            />
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  <div class="dialog__body" class:dialog__body--padded={resolvedPadding === 'default'}>
    {#if scrollable}
      <Scroller>
        <div class="dialog__content"><slot /></div>
      </Scroller>
    {:else}
      <div class="dialog__content dialog__content--fixed"><slot /></div>
    {/if}
  </div>

  {#if hasFooter}
    <footer class="dialog__footer">
      <div class="dialog__footer-start"><slot name="footerStart" /></div>
      <div class="dialog__footer-actions">
        {#if !hideCancel}
          <Button kind="secondary" size="medium" label={cancelLabel} on:click={cancel} />
        {/if}
        <slot name="footerActions" />
        {#if !hideSubmit}
          <Button
            bind:element={submitButton}
            type="submit"
            kind={resolvedSubmitKind}
            size="medium"
            label={submitLabel}
            tooltip={submitTooltip}
            disabled={!canSubmit}
            {loading}
          />
        {/if}
      </div>
    </footer>
  {/if}
  {#if modal}
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <span
      class="dialog__guard"
      tabindex="0"
      aria-hidden="true"
      data-focus-guard
      on:focus={(event) => {
        handleGuardFocus(event, 'end')
      }}
    />
  {/if}
</form>

<style lang="scss">
  // Out of sight but not display: none, which some engines skip when Enter submits the form.
  .dialog__enter {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .dialog {
    --_pad-x: var(--spacing-3);

    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    max-width: calc(100vw - 2rem);
    max-height: 80vh;
    margin: 0;
    background-color: var(--theme-dialog-background-color);
    border-radius: var(--large-BorderRadius);
    box-shadow: var(--global-modal-ShadowX) var(--global-modal-ShadowY) var(--global-modal-ShadowBlur)
      var(--global-modal-ShadowSpread) var(--global-popover-ShadowColor);
    font-family: var(--font-family);
    color: var(--global-primary-TextColor);
    outline: none;

    &--x-small {
      width: 25rem;
    }
    &--small {
      width: 30rem;
    }
    &--medium {
      width: 37.5rem;
    }
    &--large {
      width: 45rem;
    }
    &--x-large {
      width: 58.25rem;
    }
    &--auto {
      width: max-content;
      min-width: 20rem;
    }
    &--full {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
    }
    &--full-size {
      width: calc(100vw - 3rem);
      height: calc(100vh - 4rem);
      max-width: calc(100vw - 3rem);
      max-height: calc(100vh - 4rem);
    }
    &--embedded {
      --_pad-x: var(--spacing-1_5);

      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      border-radius: 0;
      box-shadow: none;
    }
  }

  .dialog__guard {
    position: fixed;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .dialog__header {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--spacing-1);
    min-height: var(--spacing-6_5);
    padding: var(--spacing-1_5) var(--spacing-2);
    border-bottom: 1px solid var(--theme-dialog-border-color);
  }

  // On the whole title, as the legacy header: text passed in the title slot gets the same look as `label`.
  .dialog__title {
    display: flex;
    align-items: center;
    flex-grow: 1;
    gap: var(--spacing-1);
    min-width: 0;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1rem;
    text-transform: uppercase;
    color: var(--global-secondary-TextColor);
  }

  .dialog__label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dialog__actions {
    display: contents;
  }

  .dialog__hotkey {
    display: inline-flex;
    color: var(--global-secondary-TextColor);
  }

  // Parts the close button from the title's own tools, so a click aimed at them does not close the dialog.
  .dialog__divider {
    flex-shrink: 0;
    width: 1px;
    height: 1.25rem;
    margin: 0 var(--spacing-0_5);
    background-color: var(--theme-divider-color);
  }

  // A place may pass the slot with nothing in it: no tools, no divider.
  .dialog__actions:not(:has(*)) ~ .dialog__divider--actions {
    display: none;
  }

  .dialog__tools {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--spacing-0_5);
    margin-left: auto;
  }

  .dialog__body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;

    // The scroller does not take padding of its parent, so the content carries it.
    &--padded .dialog__content {
      padding: var(--spacing-2_5) var(--_pad-x);
    }
  }

  .dialog__content {
    display: flex;
    flex-direction: column;
    min-width: 0;

    &--fixed {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  .dialog__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    gap: var(--spacing-2);
    padding: var(--spacing-1_5);
    border-top: 1px solid var(--theme-dialog-border-color);
  }

  .dialog__footer-start {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }

  .dialog__footer-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--spacing-1);
    margin-left: auto;
  }
</style>
