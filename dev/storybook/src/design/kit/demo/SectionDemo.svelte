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
  // Section with a text and, optionally, an action in the header
  import Button from '../Actions/Button.svelte'
  import Section from '../Settings/Section.svelte'

  export let label: string = 'Members'
  export let actions: boolean = false
</script>

{#if actions}
  <Section {label} {...$$restProps}>
    <p class="text">Alice, Bob and 3 more people.</p>
    <svelte:fragment slot="actions"><Button kind="ghost" size="small" icon="plus" /></svelte:fragment>
  </Section>
{:else}
  <Section {label} {...$$restProps}><p class="text">Alice, Bob and 3 more people.</p></Section>
{/if}

<style>
  .text {
    margin: 0;
    color: var(--global-primary-TextColor);
  }
</style>
