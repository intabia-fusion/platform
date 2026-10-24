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
  import { AttachmentTile } from '@hcengineering/attachment-resources'
  import { FileTile } from '@hcengineering/ui/kit'

  export let values: any[]
  export let progress: boolean = false
  export let kind: 'composer' | 'description' = 'composer'

  $: scale = kind === 'composer' ? ('medium' as const) : ('large' as const)
</script>

<div class={kind}>
  <div class="list">
    {#each values as value}
      <AttachmentTile {value} {scale} removable />
    {/each}
    {#if progress}
      <FileTile {scale} name="Demo recording.mov" size={48_000_000} badge={{ label: 'MOV' }} progress={0.4} removable />
    {/if}
  </div>
</div>

<style lang="scss">
  .composer {
    max-width: 56rem;
    border: 1px solid var(--theme-refinput-border);
    border-radius: 0.75rem;
    background-color: var(--theme-refinput-color);

    .list {
      align-items: center;
      padding: 0.5rem;
      overflow-x: auto;
      overflow-y: hidden;
    }
  }

  .description {
    max-width: 48rem;

    .list {
      flex-wrap: wrap;
      padding: 0.125rem;
    }
  }

  .list {
    display: flex;
    gap: 0.5rem;
  }
</style>
