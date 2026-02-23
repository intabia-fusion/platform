import { PersonId, type Ref } from '@hcengineering/core'
import notification, { NotificationProvider } from '@hcengineering/notification'
import { TriggerControl } from '@hcengineering/server-core'

export async function getInviteAllowedProviders (
  control: TriggerControl,
  socialIds: PersonId[]
): Promise<Ref<NotificationProvider>[]> {
  const result: Ref<NotificationProvider>[] = []
  const providers = await control.modelDb.findAll(notification.class.NotificationProvider, {})

  for (const provider of providers) {
    if (provider._id === notification.providers.InboxNotificationProvider) {
      result.push(provider._id)
    }

    if (
      ![notification.providers.PushNotificationProvider, notification.providers.SoundNotificationProvider].includes(
        provider._id
      )
    ) { continue }

    const allowed = await isProviderAllowed(control, provider, socialIds)

    if (allowed) {
      result.push(provider._id)
    }
  }

  return result
}

async function isProviderAllowed (
  control: TriggerControl,
  provider: NotificationProvider,
  socialIds: PersonId[]
): Promise<boolean> {
  const providerSettings = await control.findAll(control.ctx, notification.class.NotificationProviderSetting, {
    attachedTo: provider._id,
    createdBy: { $in: socialIds }
  })

  if (providerSettings.length > 0 && providerSettings.every((s) => !s.enabled)) {
    return false
  }

  return !(providerSettings.length === 0 && !provider.defaultEnabled)
}
