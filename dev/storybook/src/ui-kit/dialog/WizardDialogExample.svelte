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
  import { WizardDialog, type WizardDialogProps } from '@hcengineering/ui/kit'

  export let props: Partial<WizardDialogProps> = {}
  export let selected: string | undefined = undefined
  export let withFooterStart: boolean = false

  const steps = [
    { id: 'file', label: getEmbeddedLabel('Select file') },
    { id: 'statuses', label: getEmbeddedLabel('Map statuses') },
    { id: 'review', label: getEmbeddedLabel('Review') }
  ]
  const bodies: Record<string, string> = {
    file: 'Choose a JSON file exported from another workspace.',
    statuses: 'Match every status from the file with a status of this workspace.',
    review: '3 task types and 12 statuses will be imported.'
  }
</script>

<WizardDialog
  label={getEmbeddedLabel('Import task types')}
  submitLabel={getEmbeddedLabel('Import')}
  {steps}
  bind:selected
  {...props}
  {...$$restProps}
>
  <p class="wizard-example__text">{bodies[selected ?? 'file']}</p>
  <svelte:fragment slot="footerStart">
    {#if withFooterStart}<span class="wizard-example__hint">2 statuses are not mapped</span>{/if}
  </svelte:fragment>
</WizardDialog>

<style lang="scss">
  .wizard-example__text {
    margin: 0;
    line-height: 1.25rem;
    color: var(--global-primary-TextColor);
  }
  .wizard-example__hint {
    font-size: 0.8125rem;
    color: var(--global-secondary-TextColor);
  }
</style>
