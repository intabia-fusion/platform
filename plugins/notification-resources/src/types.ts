import type { Ref } from '@intabiafusion/core'
import type { DisplayInboxNotification, DocNotifyContext } from '@intabiafusion/notification'
import type { IntlString } from '@intabiafusion/platform'

export type InboxNotificationsFilter = 'all' | 'unread'

export type InboxData = Map<Ref<DocNotifyContext>, DisplayInboxNotification[]>

export interface SettingItem {
  id: string
  on: boolean
  label: IntlString
  onToggle: () => void
}
