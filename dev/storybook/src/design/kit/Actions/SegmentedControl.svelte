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
  import { SegmentedControl } from '@hcengineering/ui/kit'
  import type { SegmentedControlSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let items: Array<string | [string, IconName?, string?]>
  // Label of the selected segment
  export let selected: string | undefined = undefined
  export let size: SegmentedControlSize | undefined = undefined
  export let iconOnly: boolean = false

  $: segments = items.map((item) => {
    const [label, icon, badge] = typeof item === 'string' ? [item] : item
    return {
      id: label,
      label: getEmbeddedLabel(label),
      icon: kitIcon(icon),
      badge: badge !== undefined ? getEmbeddedLabel(badge) : undefined
    }
  })
</script>

<SegmentedControl items={segments} {selected} {size} {iconOnly} aria-label="Segmented control" />
