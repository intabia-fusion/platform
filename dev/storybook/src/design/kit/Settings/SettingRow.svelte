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
  import { SettingRow } from '@hcengineering/ui/kit'
  import type { SettingRowKind } from '@hcengineering/ui/kit'

  export let label: string
  // true shows the info button with a stock text
  export let hint: string | boolean | undefined = undefined
  export let alignTop: boolean = false
  export let stacked: boolean = false
  export let kind: SettingRowKind | undefined = undefined
  export let fullWidth: boolean = false
  export let width: number | undefined = undefined

  $: hintText = hint === true ? 'Hint' : typeof hint === 'string' ? hint : undefined
  $: hintLabel = hintText !== undefined ? getEmbeddedLabel(hintText) : undefined
</script>

<div class:top={alignTop} style:width={width !== undefined ? `${width}px` : 'fit-content'}>
  {#if $$slots.details}
    <SettingRow label={getEmbeddedLabel(label)} hint={hintLabel} {stacked} {kind} {fullWidth}>
      <slot />
      <svelte:fragment slot="details"><slot name="details" /></svelte:fragment>
    </SettingRow>
  {:else}
    <SettingRow label={getEmbeddedLabel(label)} hint={hintLabel} {stacked} {kind} {fullWidth}><slot /></SettingRow>
  {/if}
</div>

<style>
  .top :global(.setting-row__main) {
    align-items: flex-start;
  }
</style>
