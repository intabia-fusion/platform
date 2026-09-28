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

<!-- The email provider's row: a button that opens its settings in a modal, as Telegram does. -->
<script lang="ts">
  import notification, { type NotificationProvider, type NotificationProviderSetting } from '@hcengineering/notification'
  import { ModernButton, showPopup } from '@hcengineering/ui'

  import EmailPreferencesPopup from './EmailPreferencesPopup.svelte'

  export let provider: NotificationProvider
  export let setting: NotificationProviderSetting | undefined
  export let enabled: boolean

  function configure (): void {
    showPopup(EmailPreferencesPopup, { provider, setting, enabled })
  }
</script>

{#if enabled}
  <div class="configure mt-2">
    <ModernButton label={notification.string.Configure} kind="primary" size="small" on:click={configure} />
  </div>
{/if}

<style lang="scss">
  .configure {
    width: 9.5rem;
  }
</style>
