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
  // Navigator entry: the product NavItem with a kit icon name
  import { NavItem as ProductNavItem } from '@hcengineering/ui'
  import Icon from '../Icon.svelte'
  import { kitIcons } from '../icons'
  import { productIcon } from '../productIcon'
  import type { IconName } from '../types'

  export let label: string
  export let icon: IconName | undefined = undefined
  export let selected: boolean | undefined = false
  export let indent: boolean | undefined = false
  export let count: string | number | undefined = undefined
  // Icon on a tinted tile, for channels and other objects
  export let object: boolean = false

  // Hand-drawn kit icons have no sprite, they go through the kit Icon
  $: drawn = icon !== undefined && kitIcons[icon] !== undefined
  $: asset = drawn ? Icon : productIcon(icon)
</script>

<ProductNavItem
  type={object ? 'type-object' : 'type-link'}
  icon={asset}
  iconProps={drawn ? { name: icon, size: 16 } : undefined}
  title={label}
  selected={selected === true}
  indent={indent === true}
  count={count !== undefined ? Number(count) : null}
/>
