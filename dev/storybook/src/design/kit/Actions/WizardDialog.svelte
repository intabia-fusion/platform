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
  // Wizard dialog: the product ModernDialog with the layout of ModernWizardDialog, content in the slot
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { ModernDialog } from '@hcengineering/ui'
  import ClassicButton from './ClassicButton.svelte'
  import WizardBar from './WizardBar.svelte'

  export let title: string
  export let steps: string[]
  // Index of the current step
  export let step: number = 0
  export let width: number = 896
  export let back: string = 'Back'
  export let next: string = 'Next'
  export let submit: string = 'Create'
  export let canProceed: boolean = true
</script>

<ModernDialog
  width="{width}px"
  label={getEmbeddedLabel(title)}
  noContentPadding
  scrollableContent={false}
  className="kit-wizard"
>
  <div class="root">
    <div class="side"><WizardBar {steps} {step} /></div>
    <div class="content"><div class="body"><slot /></div></div>
  </div>

  <div slot="footerExtra" class="footerExtra">
    {#if step > 0}<ClassicButton size="large" icon="kit/ArrowLeft" label={back} />{/if}
  </div>

  <svelte:fragment slot="footerButtons">
    {#if step === steps.length - 1}
      <ClassicButton kind="positive" size="large" label={submit} />
    {:else}
      <ClassicButton kind="primary" size="large" label={next} iconRight="kit/ArrowRight" disabled={!canProceed} />
    {/if}
  </svelte:fragment>
</ModernDialog>

<style lang="scss">
  /* The stand caps the dialog at 80vh; a frame is as high as its content */
  :global(.kit-wizard.root) {
    max-height: none !important;
  }

  .root {
    display: flex;
    align-items: stretch;
    width: 100%;
    color: var(--theme-text-primary-color);
  }

  .side {
    flex: 0 0 14rem;
    box-sizing: border-box;
    padding: 1.5rem 1rem 1.5rem 1.5rem;
    border-right: 1px solid var(--theme-dialog-border-color);
  }

  .content {
    flex: 1 1 0;
    min-width: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-sizing: border-box;
    min-height: 31rem;
    padding: 1.5rem;
  }

  .footerExtra {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
</style>
