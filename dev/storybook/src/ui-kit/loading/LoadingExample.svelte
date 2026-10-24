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
  import { Button, Loading, type LoadingProps } from '@hcengineering/ui/kit'

  export let props: Partial<LoadingProps> = {}
  export let width: string = '20rem'
  export let height: string = '8rem'
  export let withActions: boolean = false
  export let extra: string = ''
</script>

<!-- The frame stands for the place: Loading fills whatever area it is given. -->
<div class="loading-example" style:width style:height>
  <!-- An actions slot passed even empty adds a row, so it is passed only when filled. -->
  {#if withActions}
    <Loading {...props} {...$$restProps}>
      {#if extra !== ''}<span>{extra}</span>{/if}
      <svelte:fragment slot="actions">
        <Button kind="secondary" size="small" label={getEmbeddedLabel('Retry')} />
        <Button kind="secondary" size="small" label={getEmbeddedLabel('Log out')} />
      </svelte:fragment>
    </Loading>
  {:else}
    <Loading {...props} {...$$restProps}>
      {#if extra !== ''}<span>{extra}</span>{/if}
    </Loading>
  {/if}
</div>

<style lang="scss">
  .loading-example {
    border: 1px dashed var(--global-ui-BorderColor);
    border-radius: var(--small-BorderRadius);
  }
</style>
