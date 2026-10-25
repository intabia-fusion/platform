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
  // The product NavGroup; NavGroup of the kit is the legacy navigator group
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { NavGroup } from '@hcengineering/ui/kit'
  import type { NavGroupKind } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let label: string
  export let icon: IconName | undefined = undefined
  export let kind: NavGroupKind | undefined = undefined
  export let expandable: boolean = false
  export let open: boolean = true
  export let divider: boolean | undefined = undefined
  export let selected: boolean | undefined = undefined
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  <NavGroup {kind} {expandable} {open} {divider} {selected} label={getEmbeddedLabel(label)} icon={kitIcon(icon)}>
    <slot />
  </NavGroup>
</div>
