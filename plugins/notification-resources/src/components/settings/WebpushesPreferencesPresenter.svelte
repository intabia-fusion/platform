<script lang="ts">
  import { getClient, createQuery, MessageBox } from '@hcengineering/presentation'
  import notification, { type PushSubscription, type PushSubscriptionSetting } from '@hcengineering/notification'
  import core, { getCurrentAccount } from '@hcengineering/core'
  import ModernToggle from '@hcengineering/ui/src/components/ModernToggle.svelte'
  import { Button, Label, showPopup, getCurrentLocation } from '@hcengineering/ui'
  import { subscribePush, parseUserAgent } from '../../utils'
  import { onMount } from 'svelte'

  let subscriptions: PushSubscription[] = []
  let settings: PushSubscriptionSetting[] = []

  const client = getClient()
  const myAcc = getCurrentAccount()

  const subsQuery = createQuery()
  subsQuery.query(
    notification.class.PushSubscription,
    {
      user: myAcc.uuid
    },
    (result) => {
      subscriptions = result
    }
  )

  const settingsQuery = createQuery()
  settingsQuery.query(notification.class.PushSubscriptionSetting, {}, (result) => {
    settings = result
  })

  $: getEnabled = (sub: PushSubscription): boolean => {
    const setting = settings.find(({ attachedTo }) => attachedTo === sub._id)
    return setting?.enabled ?? true
  }

  async function toggle (sub: PushSubscription): Promise<void> {
    const setting = settings.find(({ attachedTo }) => attachedTo === sub._id)
    const currentEnabled: boolean = setting !== undefined ? Boolean(setting.enabled) : true
    const enabled = !currentEnabled

    if (setting !== undefined) {
      await client.update(setting, { enabled })
    } else {
      await client.createDoc(notification.class.PushSubscriptionSetting, core.space.Workspace, {
        attachedTo: sub._id,
        enabled
      })
    }
  }

  async function remove (sub: PushSubscription): Promise<void> {
    showPopup(
      MessageBox,
      {
        label: notification.string.Value,
        labelProps: { value: parseUserAgent(sub.name as string) },
        message: notification.string.WebpushRemoveConfirm,
        params: { title: parseUserAgent(sub.name as string) },
        richMessage: true,
        dangerous: true,
        action: async () => {
          const setting = settings.find(({ attachedTo }) => attachedTo === sub._id)
          if (setting !== undefined) {
            await client.remove(setting)
          }
          await client.remove(sub)
        }
      },
      undefined
    )
  }

  let currentEndpoint: string | undefined = undefined

  onMount(async () => {
    const loc = getCurrentLocation()
    const registration = await navigator.serviceWorker.getRegistration(`/${loc.path[0]}/${loc.path[1]}`)
    if (registration !== undefined) {
      const current = await registration.pushManager.getSubscription()
      currentEndpoint = current?.endpoint
    }
  })

  $: alreadySubscribed = currentEndpoint !== undefined && subscriptions.some((s) => s.endpoint === currentEndpoint)
</script>

<div class="flex mb-4">
  <Button kind="primary" disabled={alreadySubscribed} label={notification.string.Subscribe} on:click={subscribePush} />
</div>
<div class="flex-col flex-gap-4">
  {#each subscriptions as subscription (subscription._id)}
    <div class="flex-row-center flex-gap-4">
      <div class="flex-col flex-gap-2 w-120">
        <span class="label">
          <span class="font-semi-bold">
            {#if subscription.name}
              {parseUserAgent(subscription.name)}
            {:else}
              <Label label={notification.string.UnknownDevice} />
            {/if}
          </span>
          {#if subscription.name === navigator.userAgent}(<Label label={notification.string.Current} />){/if}
        </span>
        <span class="description">{new Date(subscription.createdOn ?? 0).toLocaleDateString()}</span>
      </div>
      <ModernToggle size="small" checked={getEnabled(subscription)} on:change={() => toggle(subscription)} />
      <Button kind="dangerous" label={notification.string.RemoveWebpush} on:click={() => remove(subscription)} />
    </div>
  {/each}
</div>

<style lang="scss">
  .label {
    color: var(--global-primary-TextColor);
  }
  .description {
    color: var(--global-secondary-TextColor);
  }
</style>
