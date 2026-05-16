<!--
// Copyright © 2026 Intabia Fusion.
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
  import { type Person, formatName } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import { Label, ModernButton } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import love from '../../../plugin'
  import { awaitingMeetingStore, cancelAwaiting } from '../../../invites'

  export let person: Person

  const dispatch = createEventDispatcher()

  // Close the popup automatically once the awaiting entry is gone (the
  // meeting appeared and we joined, or the recipient cancelled, or TTL ran
  // out on the underlying invite).
  $: stillAwaiting = $awaitingMeetingStore.some((it) => it.from === person._id)
  $: if (!stillAwaiting) {
    dispatch('close')
  }

  function handleCancel (): void {
    cancelAwaiting(person._id)
    dispatch('close')
  }
</script>

<div class="antiPopup invite-popup flex-gap-4" data-id="awaiting-meeting-popup">
  <div class="popup-header">
    <div class="inviter-info">
      <Avatar {person} size={'small'} name={person.name} />
      <span class="inviter-name">{formatName(person.name)}</span>
    </div>
  </div>

  <div class="popup-message">
    <Label label={love.string.WaitingForMeetingFrom} params={{ name: person.name }} />
  </div>

  <div class="popup-actions">
    <ModernButton label={love.string.Cancel} kind={'secondary'} size={'medium'} on:click={handleCancel} />
  </div>
</div>

<style lang="scss">
  .invite-popup {
    padding: var(--spacing-2);
    min-width: 18rem;
    max-width: 25rem;

    .popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .inviter-info {
        display: flex;
        align-items: center;
        gap: var(--spacing-1);

        .inviter-name {
          font-weight: 600;
          font-size: 1rem;
          color: var(--theme-caption-color);
        }
      }
    }

    .popup-message {
      text-align: center;
      font-size: 0.875rem;
      color: var(--theme-content-color);
      padding: var(--spacing-1) 0;
    }

    .popup-actions {
      display: flex;
      justify-content: center;
      gap: var(--spacing-1);
      padding-top: var(--spacing-1);
    }
  }
</style>
