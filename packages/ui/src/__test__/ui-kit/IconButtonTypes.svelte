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
  // Type-level checks of IconButton props. svelte-check enforces them: tsc sees .svelte imports as any.
  import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
  import type { ComponentProps } from 'svelte'

  import type IconButton from '../../ui-kit/button/IconButton.svelte'

  const icon = 'ui:icon:Settings' as Asset
  const label = getEmbeddedLabel('Settings')

  export const named: Array<ComponentProps<IconButton>> = [
    { icon, tooltip: { label } },
    { icon, 'aria-label': 'Settings' }
  ]

  // @ts-expect-error neither a tooltip label nor aria-label
  export const unnamed: ComponentProps<IconButton> = { icon }
  // @ts-expect-error a tooltip without a label names nothing
  export const emptyTooltip: ComponentProps<IconButton> = { icon, tooltip: {} }
  // @ts-expect-error an icon button has no text
  export const labelled: ComponentProps<IconButton> = { icon, tooltip: { label }, label }
</script>
