<script lang="ts">
  import ui, { eventToHTMLElement, showPopup, SplitButton } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import { isShareWithSound, liveKitClient } from '../../../utils'
  import ShareSettingPopup from '../../ShareSettingPopup.svelte'
  import love from '../../../plugin'
  import { lkSessionConnected, ScreenSharingState, screenSharingState } from '../../../liveKitClient'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  const dispatch = createEventDispatcher()

  async function changeShare (): Promise<void> {
    const newValue = $screenSharingState !== ScreenSharingState.Local
    const audio = newValue && $isShareWithSound
    await liveKitClient.setScreenShareEnabled(newValue, audio)
    dispatch('changeShare')
  }

  function shareSettings (e: MouseEvent): void {
    showPopup(ShareSettingPopup, {}, eventToHTMLElement(e))
  }

  $: localScreenShare = $screenSharingState === ScreenSharingState.Local
</script>

<SplitButton
  {size}
  icon={localScreenShare ? love.icon.SharingEnabled : love.icon.SharingDisabled}
  iconProps={{
    fill: localScreenShare ? 'var(--bg-negative-default)' : 'var(--bg-positive-default)'
  }}
  showTooltip={{ label: localScreenShare ? love.string.StopShare : love.string.Share }}
  disabled={$screenSharingState === ScreenSharingState.Remote || !$lkSessionConnected}
  action={changeShare}
  secondIcon={ui.icon.ChevronUpSmall}
  secondAction={shareSettings}
  separate
/>
