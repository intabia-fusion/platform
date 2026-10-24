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
  import { formatName } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import type { Timestamp } from '@hcengineering/core'

  import type { AttachmentRow } from '../../../../search/attachments'
  import DayLabel from './DayLabel.svelte'

  export let row: Pick<AttachmentRow, 'person'>
  /** After the name, and on its own when the author is not found. */
  export let date: Timestamp | undefined = undefined
</script>

{#if row.person != null || date != null}
  <span class="author">
    {#if row.person != null}
      <span class="avatar"><Avatar person={row.person} name={row.person.name} size="inline" /></span>
      <span class="overflow-label">{formatName(row.person.name)}</span>
    {/if}
    {#if date != null}
      <span class="date"
        >{#if row.person != null}·{/if}<DayLabel value={date} /></span
      >
    {/if}
  </span>
{/if}

<style lang="scss">
  .author {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    min-width: 0;
  }

  .avatar {
    display: inline-flex;
    flex-shrink: 0;
  }

  .date {
    display: inline-flex;
    flex-shrink: 0;
    // A flex box drops the space after the dot.
    gap: 0.375rem;
    color: var(--theme-darker-color);
  }
</style>
