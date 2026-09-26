<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Doc, Ref } from '@hcengineering/core'
  import type { AppPushNotification } from '@hcengineering/notification'
  import {
    translateNotification,
    PUSH_NOTIFICATION_TITLE_SIZE,
    PUSH_NOTIFICATION_BODY_SIZE,
    truncate
  } from '@hcengineering/notification'
  import {
    addNotification,
    getCurrentResolvedLocation,
    NotificationSeverity,
    languageStore,
    deviceOptionsStore,
    desktopPlatform
  } from '@hcengineering/ui'
  import workbench from '@hcengineering/workbench'
  import { getResource } from '@hcengineering/platform'

  import Notification from './Notification.svelte'
  import { appPushStore, removeAppPush, desktopPushEnabled } from '../appPush'
  import { getObjectIdFromLocation } from '../utils'

  $: if ($appPushStore && $appPushStore.length > 0) {
    for (const item of $appPushStore) {
      void notify(item)
    }
  }

  async function notify (value: AppPushNotification): Promise<void> {
    if ($deviceOptionsStore.isMobile) return
    if (desktopPlatform && $desktopPushEnabled) return

    const _id: Ref<Doc> | undefined = value.objectId
    void removeAppPush(value)

    const getSidebarObject = await getResource(workbench.function.GetSidebarObject)
    const sidebarObjectId = getSidebarObject()?._id

    if (_id != null && _id === sidebarObjectId) return

    const locObjectId = await getObjectIdFromLocation(getCurrentResolvedLocation())

    if (_id != null && _id === locObjectId) return

    const { title, body } = await translateNotification(value, $languageStore)

    addNotification(
      truncate(title, PUSH_NOTIFICATION_TITLE_SIZE),
      truncate(body, PUSH_NOTIFICATION_BODY_SIZE),
      Notification,
      { value },
      NotificationSeverity.Info,
      `notification-${value.objectId}`
    )
  }
</script>
