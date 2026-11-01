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
  import { Section } from '@hcengineering/ui/kit'
  import { kitIcon } from '../kitIcon'
  import type { IconName } from '../types'

  export let label: string
  export let icon: IconName | undefined = undefined
  export let level: 2 | 3 | 4 | undefined = undefined
  export let width: number | undefined = undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  {#if $$slots.actions}
    <Section label={getEmbeddedLabel(label)} icon={kitIcon(icon)} {level}>
      <slot />
      <svelte:fragment slot="actions"><slot name="actions" /></svelte:fragment>
    </Section>
  {:else}
    <Section label={getEmbeddedLabel(label)} icon={kitIcon(icon)} {level}><slot /></Section>
  {/if}
</div>
