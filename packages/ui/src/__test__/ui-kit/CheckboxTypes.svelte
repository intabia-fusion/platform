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
  // Type-level checks of Checkbox and Radio names. svelte-check enforces them: tsc sees .svelte imports as any.
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import type { CheckboxProps } from '../../ui-kit/checkbox/types'
  import type { RadioProps } from '../../ui-kit/radio/types'

  const label = getEmbeddedLabel('Show archived')

  export const named: CheckboxProps[] = [
    { label },
    { 'aria-label': 'Select' },
    { 'aria-labelledby': 'heading' },
    { decorative: true, checked: true }
  ]

  // @ts-expect-error neither a label nor aria-label / aria-labelledby
  export const unnamed: CheckboxProps = { checked: true }
  // @ts-expect-error a decorative box is not announced, so it has no name
  export const namedDecorative: CheckboxProps = { decorative: true, 'aria-label': 'Select' }

  export const radios: Array<RadioProps<number>> = [
    { value: 1, label },
    { value: 1, group: null, 'aria-label': 'One' }
  ]

  // @ts-expect-error an option without a name
  export const unnamedRadio: RadioProps<number> = { value: 1 }
  // @ts-expect-error the group holds values of the option type
  export const wrongGroup: RadioProps<number> = { value: 1, group: 'one', label }
</script>
