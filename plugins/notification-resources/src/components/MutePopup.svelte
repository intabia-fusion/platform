<script lang="ts">
  import { SelectPopup } from '@hcengineering/ui'
  import notification, { DocNotificationMode, DocNotifyContext } from '@hcengineering/notification'

  import Mention from './icons/Mention.svelte'
  import { Doc, getCurrentAccount, Ref } from '@hcengineering/core'
  import { InboxNotificationsClientImpl } from '../inboxNotificationsClient'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { createEventDispatcher } from 'svelte'
  import { getCurrentEmployeeSpace } from '@hcengineering/contact'

  export let value: Doc | Doc[]

  const client = getClient()
  const dispatch = createEventDispatcher()
  const mySpace = getCurrentEmployeeSpace()
  const notificationsClient = InboxNotificationsClientImpl.getClient()
  const contextByDocStore = notificationsClient.contextByDoc

  const query = createQuery(true)
  let context: DocNotifyContext | undefined = undefined

  $: object = Array.isArray(value) ? value[0] : value
  $: void updateContext(object._id, $contextByDocStore)

  $: mode = context?.settings?.mode ?? 'all'
  async function updateContext (objectId: Ref<Doc>, contextByDoc: Map<Ref<Doc>, DocNotifyContext>): Promise<void> {
    context = contextByDoc.get(objectId)

    if (context == null) {
      query.query(
        notification.class.DocNotifyContext,
        {
          objectId,
          user: getCurrentAccount().uuid
        },
        (res) => {
          context = res[0]
        },
        { limit: 1 }
      )
    } else {
      query.unsubscribe()
    }
  }

  let progress = false
  async function select (id: DocNotificationMode): Promise<void> {
    try {
      progress = true
      const current = context?.settings?.mode ?? 'all'

      if (id === current) {
        dispatch('close')
        return
      }

      if (context == null) {
        await client.createDoc(notification.class.DocNotifyContext, mySpace, {
          objectId: object._id,
          objectClass: object._class,
          objectSpace: object.space,
          user: getCurrentAccount().uuid,
          settings: { mode: id }
        })
      } else {
        await client.update(context, { settings: { mode: id } })
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
      icon: Mention,
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
