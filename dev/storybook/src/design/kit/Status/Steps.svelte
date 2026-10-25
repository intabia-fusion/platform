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
  import { Steps } from '@hcengineering/ui/kit'

  export let items: string[]
  // Index of the current step, none when absent or -1
  export let selected: number | undefined = undefined

  $: steps = items.map((label, i) => ({ id: `${i}`, label: getEmbeddedLabel(label) }))
</script>

<Steps
  items={steps}
  selected={selected !== undefined && selected >= 0 ? `${selected}` : undefined}
  aria-label="Steps"
/>
