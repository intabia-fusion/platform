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
  import { Checkbox } from '@hcengineering/ui/kit'
  import type { CheckboxKind, CheckboxSize } from '@hcengineering/ui/kit'

  export let checked: boolean = false
  export let label: string | undefined = undefined
  export let indeterminate: boolean = false
  export let size: CheckboxSize | undefined = undefined
  export let kind: CheckboxKind | undefined = undefined
  export let shape: 'rectangle' | 'round' | undefined = undefined
  export let disabled: boolean = false
  export let error: boolean = false
</script>

{#if label !== undefined}
  <Checkbox {checked} {indeterminate} {size} {kind} {shape} {disabled} {error} label={getEmbeddedLabel(label)} />
{:else}
  <Checkbox {checked} {indeterminate} {size} {kind} {shape} {disabled} {error} aria-label="Checkbox" />
{/if}
