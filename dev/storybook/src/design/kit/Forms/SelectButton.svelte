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
  import { SelectButton } from '@hcengineering/ui/kit'
  import type { SelectButtonKind, SelectButtonSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let kind: SelectButtonKind | undefined = undefined
  export let size: SelectButtonSize | undefined = undefined
  export let label: string | undefined = undefined
  export let placeholder: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  export let chevron: boolean = false
  export let pressed: boolean = false
  export let disabled: boolean = false
  // Secondary in a form: the fill and border of the text fields
  export let field: boolean = false
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <SelectButton
    {kind}
    {size}
    {chevron}
    {pressed}
    {disabled}
    {field}
    fullWidth={width !== undefined}
    icon={kitIcon(icon)}
    label={label !== undefined ? getEmbeddedLabel(label) : undefined}
    placeholder={placeholder !== undefined ? getEmbeddedLabel(placeholder) : undefined}
  />
</div>
