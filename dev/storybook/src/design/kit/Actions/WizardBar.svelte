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
  // Steps of a wizard: the product ModernWizardBar, 184 px wide as in the dialog's side column
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { ModernWizardBar } from '@hcengineering/ui'

  export let steps: string[]
  // Index of the current step
  export let step: number = 0

  $: wizardSteps = steps.map((title, i) => ({ id: String(i), title: getEmbeddedLabel(title) }))
</script>

<div class="kit-wizard-bar"><ModernWizardBar steps={wizardSteps} selectedStep={String(step)} /></div>

<style>
  .kit-wizard-bar {
    width: 184px;
    color: var(--theme-text-primary-color);
  }
</style>
