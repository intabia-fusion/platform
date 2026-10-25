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
  // Callout with an optional action button
  import Button from '../Actions/Button.svelte'
  import Callout from '../Status/Callout.svelte'

  export let actions: boolean = false
</script>

{#if actions}
  <Callout text="The channel will be archived." {...$$restProps}>
    <svelte:fragment slot="actions"><Button kind="secondary" size="small" label="Undo" /></svelte:fragment>
  </Callout>
{:else}
  <Callout text="The channel will be archived." {...$$restProps} />
{/if}
