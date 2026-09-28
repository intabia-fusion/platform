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

<!--
  The email provider's settings: how long a letter waits, and the address it goes to. The address
  is not a choice: pod-mail writes to the person's first verified email (pickNotificationEmail),
  and this shows the same one; another address is added or released in the profile.
-->
<script lang="ts">
  import { getCurrentAccount, SocialIdType } from '@hcengineering/core'
  import notification, {
    type NotificationProvider,
    type NotificationProviderSetting
  } from '@hcengineering/notification'
  import presentation, { createQuery } from '@hcengineering/presentation'
  import { Label, Modal } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import ProviderHoldPreferences from './ProviderHoldPreferences.svelte'

  export let provider: NotificationProvider
  export let setting: NotificationProviderSetting | undefined
  export let enabled: boolean

  const dispatch = createEventDispatcher()

  // The popup outlives a change of the setting made inside it: follow the document.
  const settingQuery = createQuery()
  $: settingQuery.query(notification.class.NotificationProviderSetting, { attachedTo: provider._id }, (result) => {
    setting = result[0] ?? setting
  })

  const email = getCurrentAccount().fullSocialIds.find(
    (it) =>
      (it.type === SocialIdType.EMAIL || it.type === SocialIdType.GOOGLE) &&
      it.verifiedOn !== undefined &&
      it.verifiedOn > 0 &&
      it.isDeleted !== true
  )?.value
</script>

<Modal
  label={provider.label}
  type="type-popup"
  padding="var(--spacing-2) var(--spacing-3) var(--spacing-2_5)"
  okLabel={presentation.string.Ok}
  okAction={() => {
    dispatch('close')
  }}
  bottomPadding="0.5rem"
  showCancelButton={false}
  canSave
  on:close
>
  <!-- The modal's own padding is enough: the set adds none and the line no top border; the address is a plain sentence. -->
  <div class="hulyModal-content__settingsSet" style="padding: 0">
    <p class="note hint"><Label label={notification.string.EmailHoldHint} /></p>
    <ProviderHoldPreferences {provider} {setting} {enabled} />
    <p class="note">
      {#if email !== undefined}
        <Label label={notification.string.LettersGoTo} />
        <span class="address">{email}</span>
      {:else}
        <Label label={notification.string.NoVerifiedEmail} />
      {/if}
    </p>
  </div>
</Modal>

<style lang="scss">
  .note {
    margin: var(--spacing-2_5) 0 0;
    color: var(--global-secondary-TextColor);

    &.hint {
      margin: 0 0 var(--spacing-1_5);
    }
  }

  .address {
    color: var(--global-primary-TextColor);
    font-weight: 500;
  }
</style>
