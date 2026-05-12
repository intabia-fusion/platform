import type { Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'
import type { IntlString } from '@hcengineering/platform'

export type InboxNotificationsFilter = 'all' | 'unread'

export type InboxData = Map<Ref<DocNotifyContext>, any[]>

export interface SettingItem {
  id: string
  on: boolean
  label: IntlString
  onToggle: () => void
}
