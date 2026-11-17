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
  import { Callout } from '@hcengineering/ui/kit'
  import type { CalloutTone } from '@hcengineering/ui/kit'

  export let text: string
  export let tone: CalloutTone | undefined = undefined
  export let title: string | undefined = undefined
  export let width: number | undefined = undefined

  $: titleLabel = title !== undefined ? getEmbeddedLabel(title) : undefined
</script>

<div style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  {#if $$slots.actions}
    <Callout {tone} label={getEmbeddedLabel(text)} title={titleLabel}>
      <svelte:fragment slot="actions"><slot name="actions" /></svelte:fragment>
    </Callout>
  {:else}
    <Callout {tone} label={getEmbeddedLabel(text)} title={titleLabel} />
  {/if}
</div>
