<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { eventToHTMLElement, showPopup, IconSettings } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import notification from '@hcengineering/notification'

  import SettingsPopup from './SettingsPopup.svelte'
  import type { SettingItem } from '../../types'

  export let items: SettingItem[] = []

  function click (e: MouseEvent): void {
    showPopup(SettingsPopup, { items }, eventToHTMLElement(e))
  }
</script>

<IconButton
  icon={IconSettings}
  size="small"
  tooltip={{ label: notification.string.Configure }}
  on:click={click}
  data-id="inbox_settings-button"
/>
