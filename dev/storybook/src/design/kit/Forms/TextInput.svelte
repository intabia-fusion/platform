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
  import { TextInput } from '@hcengineering/ui/kit'
  import type { TextInputKind, TextInputSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let kind: TextInputKind | undefined = undefined
  export let size: TextInputSize | undefined = undefined
  export let value: string | undefined = undefined
  export let placeholder: string | undefined = undefined
  export let label: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  export let clearable: boolean = false
  export let error: boolean = false
  export let disabled: boolean = false
  export let heading: boolean = false
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <TextInput
    {kind}
    {size}
    {value}
    {clearable}
    {error}
    {disabled}
    {heading}
    fullWidth={width !== undefined}
    icon={kitIcon(icon)}
    label={label !== undefined ? getEmbeddedLabel(label) : undefined}
    placeholder={placeholder !== undefined ? getEmbeddedLabel(placeholder) : undefined}
    aria-label={label ?? placeholder ?? 'Text input'}
  />
</div>
