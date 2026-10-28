<script lang="ts">
  import ui, { SelectPopup } from '@hcengineering/ui'
  import type { DocNotificationMode, DocNotificationSetting } from '@hcengineering/notification'
  import notification from '@hcengineering/notification'
  import type { Doc } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { createEventDispatcher } from 'svelte'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'

  import { NotificationClientImpl } from '../client'

  // The document whose notifications are set: its id and class are all the popup needs
  export let value: Pick<Doc, '_id' | '_class'> | Array<Pick<Doc, '_id' | '_class'>>

  const client = getClient()
  const dispatch = createEventDispatcher()
  const mySpace = getCurrentEmployeeSpace()
  const inboxClient = NotificationClientImpl.getClient()
  const settingByDocStore = inboxClient.docSettingByDoc

  let setting: DocNotificationSetting | undefined = undefined
  let progress = false

  $: object = Array.isArray(value) ? value[0] : value
  $: void inboxClient.loadDocSetting(object._id)
  $: setting = $settingByDocStore.get(object._id) ?? undefined
  $: mode = setting?.mode ?? 'all'

  async function select (mode: DocNotificationMode): Promise<void> {
    try {
      progress = true
      const current = setting?.mode ?? 'all'

      if (mode === current) {
        dispatch('close')
        return
      }

      if (setting == null) {
        await client.createDoc(notification.class.DocNotificationSetting, mySpace, {
          attachedTo: object._id,
          attachedToClass: object._class,
          account: getCurrentAccount().uuid,
          mode
        })
      } else {
        await client.update(setting, { mode })
      }
      dispatch('close')
    } finally {
      progress = false
    }
  }
</script>

<SelectPopup
  value={[
    {
      id: 'all',
      icon: notification.icon.Notifications,
      label: notification.string.AllNotifications,
      isSelected: mode === 'all'
    },
    {
      id: 'mentions',
      icon: ui.icon.At,
      label: notification.string.JustMentions,
      isSelected: mode === 'mentions'
    },
    {
      id: 'mute',
      icon: notification.icon.BellCrossed,
      label: notification.string.Mute,
      isSelected: mode === 'mute'
    }
  ]}
  on:close={(evt) => {
    void select(evt.detail)
  }}
  loading={progress}
  searchable={false}
  width="medium"
  size="small"
  embedded={false}
  on:changeContent
/>
