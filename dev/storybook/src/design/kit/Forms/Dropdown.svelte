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
  // Closed Dropdown: the items are the selected labels, more than one makes it a multiselect
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Dropdown } from '@hcengineering/ui/kit'
  import type { SelectButtonKind, SelectButtonSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let values: string[] = []
  export let placeholder: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  export let kind: SelectButtonKind | undefined = undefined
  export let size: SelectButtonSize | undefined = undefined
  export let chevron: boolean = true
  export let width: number | undefined = undefined

  $: items = values.map((v) => ({ id: v, label: getEmbeddedLabel(v) }))
  $: multiselect = values.length > 1
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <Dropdown
    {items}
    {multiselect}
    {kind}
    {size}
    {chevron}
    selected={multiselect ? values : values[0]}
    fullWidth={width !== undefined}
    icon={kitIcon(icon)}
    placeholder={placeholder !== undefined ? getEmbeddedLabel(placeholder) : undefined}
  />
</div>
