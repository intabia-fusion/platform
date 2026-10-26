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
<script lang="ts" generics="Id extends string = string">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, tick } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Scroller from '../../components/Scroller.svelte'
  import ui from '../../plugin'
  import Button from '../button/Button.svelte'
  import Dialog from '../dialog/Dialog.svelte'
  import type { DialogWidth } from '../dialog/types'
  import Steps from '../steps/Steps.svelte'
  import type { StepsItem } from '../steps/types'
  import type { WizardDialogEvents, WizardDialogProps, WizardDialogSlots } from './types'

  type $$Props = WizardDialogProps<Id>
  type $$Events = WizardDialogEvents<Id>
  type $$Slots = WizardDialogSlots

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let steps: ReadonlyArray<StepsItem<Id>>
  export let selected: Id | undefined = undefined
  export let canProceed: boolean = true
  export let canSubmit: boolean = true
  export let submitLabel: IntlString = ui.string.Submit
  export let loading: boolean = false
  export let width: DialogWidth | undefined = undefined

  const dispatch = createEventDispatcher<{ select: Id, submit: null, cancel: null, close: null }>()

  let dialog: Dialog | undefined = undefined
  let body: HTMLElement | undefined | null = undefined
  let nextButton: HTMLButtonElement | undefined = undefined
  let submitButton: HTMLButtonElement | undefined = undefined
  let shownStep: Id | undefined = undefined

  // An id that is not among the steps falls back to the first step, so a step is always current.
  $: current = selected !== undefined && steps.some((step) => step.id === selected) ? selected : steps[0]?.id
  $: index = steps.findIndex((step) => step.id === current)
  $: isLast = index === steps.length - 1
  $: if (current !== shownStep) showStep(current)

  // A new step starts from its top, not from where the previous one was scrolled.
  function showStep (step: Id | undefined): void {
    shownStep = step
    if (body != null) body.scrollTop = 0
  }

  async function go (to: number): Promise<void> {
    const step = steps[to]
    if (step === undefined) return
    // The place may keep the step: an invalid file, a check that failed.
    if (!dispatch('select', step.id, { cancelable: true })) return
    const focused = document.activeElement
    selected = step.id
    await tick()
    // Back disappears on the first step and Next turns into the submit on the last: focus goes to the main button.
    if (focused instanceof HTMLElement && !focused.isConnected) (isLast ? submitButton : nextButton)?.focus()
  }

  /** For the popup host, as at `Dialog`: a prevented `cancel` keeps the wizard open. */
  export function canClose (): boolean {
    return dialog?.canClose() ?? true
  }

  function forwardCancel (event: CustomEvent<null>): void {
    if (!dispatch('cancel', null, { cancelable: true })) event.preventDefault()
  }
</script>

<Dialog
  bind:this={dialog}
  {label}
  {labelParams}
  width={width ?? 'x-large'}
  padding="none"
  scrollable={false}
  hideCancel
  hideSubmit
  {...$$restProps}
  on:cancel={forwardCancel}
  on:close
>
  <div class="wizard">
    <div class="wizard__steps">
      <Scroller>
        <div class="wizard__steps-list"><Steps items={steps} selected={current} /></div>
      </Scroller>
    </div>
    <div class="wizard__body">
      <Scroller bind:divScroll={body}>
        <div class="wizard__content"><slot /></div>
      </Scroller>
    </div>
  </div>

  <svelte:fragment slot="footerStart">
    {#if index > 0}
      <Button
        kind="secondary"
        size="medium"
        icon={ui.icon.ArrowLeft}
        label={ui.string.Back}
        disabled={loading}
        on:click={() => {
          void go(index - 1)
        }}
      />
    {/if}
    <slot name="footerStart" />
  </svelte:fragment>

  <svelte:fragment slot="footerActions">
    {#if isLast}
      <Button
        kind="positive"
        size="medium"
        label={submitLabel}
        disabled={!canSubmit}
        {loading}
        bind:element={submitButton}
        on:click={() => dispatch('submit', null)}
      />
    {:else}
      <Button
        kind="brand"
        size="medium"
        label={ui.string.NextStep}
        disabled={!canProceed || loading}
        bind:element={nextButton}
        on:click={() => {
          void go(index + 1)
        }}
      >
        <Icon icon={ui.icon.ArrowRight} size="small" />
      </Button>
    {/if}
  </svelte:fragment>
</Dialog>

<style lang="scss">
  .wizard {
    display: flex;
    align-items: stretch;
    flex: 1 1 auto;
    min-height: 0;
  }

  .wizard__steps {
    display: flex;
    flex-direction: column;
    flex: 0 0 14rem;
    min-width: 0;
    border-right: 1px solid var(--theme-dialog-border-color);
  }

  .wizard__steps-list {
    padding: var(--spacing-3) var(--spacing-2) var(--spacing-3) var(--spacing-3);
  }

  .wizard__body {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-width: 0;
  }

  .wizard__content {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-3);
  }
</style>
