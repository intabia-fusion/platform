<script lang="ts">
  import core, { getCurrentAccount } from '@intabiafusion/core'
  import { DevicesPreference } from '@intabiafusion/love'
  import { getClient } from '@intabiafusion/presentation'
  import { Breadcrumb, Header, Label, Toggle } from '@intabiafusion/ui'
  import { isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter'
  import love from '../plugin'
  import { myPreferences } from '../stores'
  import { krispProcessor } from '../utils'

  const client = getClient()

  async function saveMicPreference (myPreferences: DevicesPreference | undefined, value: boolean): Promise<void> {
    if (myPreferences !== undefined) {
      await client.update(myPreferences, { micEnabled: !value })
    } else {
      const acc = getCurrentAccount().uuid
      await client.createDoc(love.class.DevicesPreference, core.space.Workspace, {
        attachedTo: acc,
        noiseCancellation: true,
        micEnabled: !value,
        camEnabled: true,
        blurRadius: 0
      })
    }
  }

  async function saveCamPreference (myPreferences: DevicesPreference | undefined, value: boolean): Promise<void> {
    if (myPreferences !== undefined) {
      await client.update(myPreferences, { camEnabled: !value })
    } else {
      const acc = getCurrentAccount().uuid
      await client.createDoc(love.class.DevicesPreference, core.space.Workspace, {
        attachedTo: acc,
        noiseCancellation: true,
        camEnabled: !value,
        micEnabled: true,
        blurRadius: 0
      })
    }
  }

  async function saveNoiseCancellationPreference (
    myPreferences: DevicesPreference | undefined,
    value: boolean
  ): Promise<void> {
    if (myPreferences !== undefined) {
      await client.update(myPreferences, { noiseCancellation: value })
    } else {
      const acc = getCurrentAccount().uuid
      await client.createDoc(love.class.DevicesPreference, core.space.Workspace, {
        attachedTo: acc,
        noiseCancellation: value,
        camEnabled: true,
        micEnabled: true,
        blurRadius: 0
      })
    }
    await krispProcessor.setEnabled(value)
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={love.icon.Love} label={love.string.Settings} size={'large'} isCurrent />
  </Header>
  <div class="flex-row-stretch flex-grow p-10">
    <div class="flex-grow flex-col flex-gap-4">
      <div class="flex-row-center flex-gap-4">
        <Label label={love.string.StartWithMutedMic} />
        <Toggle
          on={!($myPreferences?.micEnabled ?? true)}
          on:change={(e) => {
            saveMicPreference($myPreferences, e.detail)
          }}
        />
      </div>
      <div class="flex-row-center flex-gap-4">
        <Label label={love.string.StartWithoutVideo} />
        <Toggle
          on={!($myPreferences?.camEnabled ?? true)}
          on:change={(e) => {
            saveCamPreference($myPreferences, e.detail)
          }}
        />
      </div>
      <div class="flex-row-center flex-gap-4">
        <Label label={love.string.NoiseCancellation} />
        <Toggle
          disabled={!isKrispNoiseFilterSupported()}
          on={isKrispNoiseFilterSupported() && ($myPreferences?.noiseCancellation ?? true)}
          showTooltip={!isKrispNoiseFilterSupported()
            ? { label: love.string.NoiseCancellationNotSupported }
            : undefined}
          on:change={(e) => {
            saveNoiseCancellationPreference($myPreferences, e.detail)
          }}
        />
      </div>
    </div>
  </div>
</div>
