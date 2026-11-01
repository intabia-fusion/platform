<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { createEventDispatcher } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'

  import Button from '../Button.svelte'
  import Scroller from '../Scroller.svelte'
  import WizardBar from './ModernWizardBar.svelte'
  import ModernDialog from '../ModernDialog.svelte'
  import type { IWizardStep } from '../../types'
  import ui from '../../plugin'

  export let loading: boolean = false
  export let label: IntlString
  export let canSubmit: boolean = true
  export let canProceed: boolean = true
  export let submitLabel: IntlString
  export let steps: ReadonlyArray<IWizardStep>
  export let selectedStep: string
  export let width: string | undefined = undefined

  const dispatch = createEventDispatcher()

  $: selectedIdx = hasSelectedStep() ? steps.findIndex((s) => s.id === selectedStep) : -1
  $: hasBack = selectedIdx > 0
  $: hasNext = selectedIdx < steps.length - 1
  $: hasSubmit = selectedIdx === steps.length - 1

  function hasSelectedStep (): boolean {
    return selectedStep !== undefined && selectedStep !== ''
  }

  function handleBack (): void {
    if (!hasSelectedStep()) {
      return
    }

    const currIdx = steps.findIndex((s) => s.id === selectedStep)
    const newIdx = currIdx > 0 ? currIdx - 1 : 0

    dispatch('stepChanged', steps[newIdx].id)
  }

  function handleNext (): void {
    if (!hasSelectedStep()) {
      return
    }

    const currIdx = steps.findIndex((s) => s.id === selectedStep)
    const newIdx = currIdx < steps.length - 1 ? currIdx + 1 : steps.length - 1

    dispatch('stepChanged', steps[newIdx].id)
  }

  function handleSubmit (): void {
    dispatch('submit')
  }
</script>

<ModernDialog
  {width}
  {loading}
  {label}
  {canSubmit}
  noContentPadding={true}
  scrollableContent={false}
  on:submit
  on:close
>
  <div class="root">
    <div class="side">
      <Scroller>
        <WizardBar {steps} {selectedStep} />
      </Scroller>
    </div>
    <div class="content">
      <Scroller>
        <div class="contentBody">
          <slot />
        </div>
      </Scroller>
    </div>
  </div>

  <div slot="footerExtra" class="footerExtra">
    <slot name="footerMessage" />
  </div>

  <!-- Back, Next and the submit together on the right; Back and Next share one width -->
  <div slot="footerButtons" class="footerButtons">
    <div class="nav">
      <!-- Disabled on the first step, not hidden: the buttons keep their places -->
      <Button
        kind="regular"
        size="large"
        label={ui.string.Back}
        icon={ui.icon.ArrowLeft}
        on:click={handleBack}
        disabled={!hasBack}
        {loading}
      />
      {#if hasNext}
        <Button
          kind="primary"
          size="large"
          label={ui.string.NextStep}
          iconRight={ui.icon.ArrowRight}
          iconRightProps={{ size: 'small' }}
          {loading}
          disabled={!canProceed}
          on:click={handleNext}
        />
      {/if}
    </div>
    {#if hasSubmit}
      <Button
        kind="positive"
        size="large"
        label={submitLabel}
        disabled={!canSubmit}
        {loading}
        on:click={handleSubmit}
      />
    {/if}
  </div>
</ModernDialog>

<style lang="scss">
  .root {
    color: var(--theme-text-primary-color);
    width: 100%;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }

  .side {
    flex: 0 0 14rem;
    padding: 1.5rem 1rem 1.5rem 1.5rem;
    min-width: 0;
    border-right: 1px solid var(--theme-dialog-border-color);
  }

  .content {
    flex: 1 1 0;
    min-width: 0;
  }

  .contentBody {
    padding: 1.5rem;
  }

  .footerButtons {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .nav {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 0.75rem;

    :global(button) {
      justify-content: center;
      width: 100%;
      min-width: 8.5rem;
    }
  }

  .footerExtra {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
</style>
