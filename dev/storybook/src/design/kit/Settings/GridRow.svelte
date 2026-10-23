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
  // Property row of a form: label (with an optional hint) in a 240 px column, the control in the slot
  export let label: string
  export let hint: string | undefined = undefined
  // The label sits at the top, for multi-line controls
  export let alignTop: boolean = false
  // The control sits in a cell with 12 px padding, for inputs
  export let padded: boolean = false
  // No gap under the row
  export let last: boolean = false
</script>

<div class="antiGrid">
  <div class="antiGrid-row" style:margin-bottom={last ? '0' : '0.5rem'}>
    <div class="antiGrid-row__header" class:withDesciption={hint !== undefined} class:topAlign={alignTop}>
      {label}
      {#if hint !== undefined}<span>{hint}</span>{/if}
    </div>
    {#if padded}
      <div class="padding"><slot /></div>
    {:else}
      <slot />
    {/if}
  </div>
</div>
