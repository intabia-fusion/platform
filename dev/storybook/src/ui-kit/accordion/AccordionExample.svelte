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
  import { IconMoreH } from '@hcengineering/ui'
  import { AccordionItem, IconButton, type AccordionItemProps } from '@hcengineering/ui/kit'

  export let props: Partial<AccordionItemProps> = {}
  export let label: AccordionItemProps['label'] = getEmbeddedLabel('Today')
  export let width: string = '22rem'
  export let withActions: boolean = false
  export let planned: string = ''
  export let rows: number = 3
</script>

<div class="accordion-example" style:width>
  <AccordionItem {label} {...props} {...$$restProps} on:toggle on:select>
    <svelte:fragment slot="meta"
      >{#if planned !== ''}<span class="accordion-example__planned">+{planned}</span>{/if}</svelte:fragment
    >
    <svelte:fragment slot="actions">
      {#if withActions}
        <IconButton icon={IconMoreH} kind="ghost" size="small" tooltip={{ label: getEmbeddedLabel('More actions') }} />
      {/if}
    </svelte:fragment>
    <ul class="accordion-example__list">
      {#each Array.from({ length: rows }, (_, i) => i + 1) as row}
        <li>Entry {row}</li>
      {/each}
    </ul>
  </AccordionItem>
</div>

<style lang="scss">
  .accordion-example {
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);

    &__planned {
      margin-left: var(--spacing-0_5);
    }
    &__list {
      margin: 0;
      padding: 0 var(--spacing-2) var(--spacing-2);
      list-style: none;
      color: var(--global-primary-TextColor);

      li {
        padding: var(--spacing-0_75) 0;
      }
    }
  }
</style>
