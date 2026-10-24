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
  import type { AttachmentRow } from '../../../../search/attachments'
  import { placeClass } from '../../../../search/browser'
  import ChannelChip from '../ChannelChip.svelte'

  export let row: Pick<AttachmentRow, 'channel' | 'raw' | 'attachedPerson' | 'thread'>
  // Held even without a chat, so what sits above it stays at one height across a row.
  export let reserve: boolean = false
</script>

{#if row.channel !== '' || reserve}
  <span class="place" class:reserve>
    {#if row.channel !== ''}
      <ChannelChip label={row.channel} _class={placeClass(row.raw)} person={row.attachedPerson} thread={row.thread} />
    {/if}
  </span>
{/if}

<style lang="scss">
  .place {
    display: flex;
    flex-shrink: 1;
    max-width: 100%;
    min-width: 0;

    // The height of a chat chip: a card without a place keeps the line, so a row stays even.
    &.reserve {
      min-height: 1.25rem;
    }
  }
</style>
