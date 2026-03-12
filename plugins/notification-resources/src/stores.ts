import { createQuery } from '@hcengineering/presentation'
import notification, { type NotificationAppearancePreference } from '@hcengineering/notification'
import { writable } from 'svelte/store'

const query = createQuery(true)

export const appearancePreferences = writable<NotificationAppearancePreference | undefined>(undefined)

query.query(notification.class.NotificationAppearancePreference, {}, (res: NotificationAppearancePreference[]) => {
  appearancePreferences.set(res[0])
})
