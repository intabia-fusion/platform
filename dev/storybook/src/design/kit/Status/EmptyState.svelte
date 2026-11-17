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
  import { EmptyState } from '@hcengineering/ui/kit'
  import type { EmptyStateKind, EmptyStateSize } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let label: string
  export let description: string | undefined = undefined
  export let icon: IconName | undefined = undefined
  export let size: EmptyStateSize | undefined = undefined
  export let kind: EmptyStateKind | undefined = undefined
  export let action: string | undefined = undefined
  // Box around the state: the large one fills its place
  export let width: number | undefined = undefined
  export let height: number | undefined = undefined
</script>

<div
  style:width={width !== undefined ? `${width}px` : 'fit-content'}
  style:height={height !== undefined ? `${height}px` : undefined}
>
  <EmptyState
    {size}
    {kind}
    label={getEmbeddedLabel(label)}
    description={description !== undefined ? getEmbeddedLabel(description) : undefined}
    action={action !== undefined ? getEmbeddedLabel(action) : undefined}
    icon={kitIcon(icon)}
  />
</div>
