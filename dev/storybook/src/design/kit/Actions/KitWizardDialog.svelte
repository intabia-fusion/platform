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
  // The product WizardDialog as an inline card; WizardDialog of the kit is the legacy one
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { WizardDialog } from '@hcengineering/ui/kit'
  import { dialogWidth } from './dialogWidth'

  export let title: string
  export let steps: string[]
  // Index of the current step
  export let selected: number = 0
  export let width: number | undefined = undefined
  export let submitLabel: string | undefined = undefined
  export let canProceed: boolean | undefined = undefined
  export let canSubmit: boolean | undefined = undefined
  export let earlySubmit: boolean = false

  $: items = steps.map((label, i) => ({ id: `${i}`, label: getEmbeddedLabel(label) }))
</script>

<WizardDialog
  label={getEmbeddedLabel(title)}
  steps={items}
  selected={`${selected}`}
  width={dialogWidth(width)}
  {canProceed}
  {canSubmit}
  {earlySubmit}
  submitLabel={submitLabel !== undefined ? getEmbeddedLabel(submitLabel) : undefined}
>
  <slot />
</WizardDialog>
