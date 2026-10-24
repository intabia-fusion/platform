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
  // Type-level checks of Toggle props. svelte-check enforces them: tsc sees .svelte imports as any.
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import type { ComponentProps } from 'svelte'

  import type Toggle from '../../ui-kit/toggle/Toggle.svelte'

  const label = getEmbeddedLabel('Private')

  export const named: Array<ComponentProps<Toggle>> = [
    { label },
    { label, description: label, labelPosition: 'start', fullWidth: true },
    { tooltip: { label } },
    { 'aria-label': 'Private' },
    { 'aria-labelledby': 'private-caption', checked: true, size: 'small', readonly: true }
  ]

  // @ts-expect-error a switch without a label, tooltip label, aria-label or aria-labelledby
  export const unnamed: ComponentProps<Toggle> = { checked: true }
  // @ts-expect-error a tooltip without a label names nothing
  export const emptyTooltip: ComponentProps<Toggle> = { tooltip: {} }
  // @ts-expect-error a description goes under a label
  export const descriptionOnly: ComponentProps<Toggle> = { 'aria-label': 'Private', description: label }
</script>
