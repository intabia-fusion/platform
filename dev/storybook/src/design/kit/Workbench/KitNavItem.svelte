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
  // The product NavItem; NavItem of the kit is the legacy navigator entry
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { NavItem } from '@hcengineering/ui/kit'
  import type { NavItemKind } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let label: string
  export let icon: IconName | undefined = undefined
  export let count: number | undefined = undefined
  export let selected: boolean = false
  export let level: number | undefined = undefined
  export let kind: NavItemKind | undefined = undefined
  export let expandable: boolean = false
  export let open: boolean = false
  export let description: string | undefined = undefined
  export let identifier: string | undefined = undefined
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <NavItem
    {count}
    {selected}
    {level}
    {kind}
    {expandable}
    {open}
    {identifier}
    label={getEmbeddedLabel(label)}
    description={description !== undefined ? getEmbeddedLabel(description) : undefined}
    icon={kitIcon(icon)}
  />
</div>
