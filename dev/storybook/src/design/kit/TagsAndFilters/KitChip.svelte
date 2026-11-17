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
  // The product Chip; Chip of this kit is the attribute chip
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Chip } from '@hcengineering/ui/kit'
  import type { ChipKind, ChipSize, ChipTone } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let label: string
  export let kind: ChipKind | undefined = undefined
  export let tone: ChipTone | undefined = undefined
  export let size: ChipSize | undefined = undefined
  export let color: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  export let removable: boolean = false
</script>

<Chip {kind} {tone} {size} {color} {removable} label={getEmbeddedLabel(label)} icon={kitIcon(icon)} />
