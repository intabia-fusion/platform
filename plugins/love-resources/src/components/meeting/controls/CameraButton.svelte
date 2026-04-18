<script lang="ts">
  import { eventToHTMLElement, IconUpOutline, showPopup, SplitButton } from '@intabiafusion/ui'
  import CamSettingPopup from '../CamSettingPopup.svelte'
  import { RoomType } from '@intabiafusion/love'
  import { currentRoom } from '../../../stores'
  import love from '../../../plugin'
  import { state, toggleCamState } from '@intabiafusion/media-resources'
  import view from '@intabiafusion/view'
  import { getClient } from '@intabiafusion/presentation'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'
  export let checkActions: boolean = true

  $: allowCam = $currentRoom?.type !== RoomType.Audio
  $: isCamEnabled = $state.camera?.enabled === true

  const camKeys = checkActions
    ? getClient().getModel().findAllSync(view.class.Action, { _id: love.action.ToggleVideo })?.[0]?.keyBinding
    : []

  function camSettings (e: MouseEvent): void {
    showPopup(CamSettingPopup, {}, eventToHTMLElement(e))
  }
</script>

{#if allowCam}
  <SplitButton
    {size}
    icon={isCamEnabled ? love.icon.CamEnabled : love.icon.CamDisabled}
    showTooltip={{
      label: isCamEnabled ? love.string.StopVideo : love.string.StartVideo,
      keys: camKeys
    }}
    action={toggleCamState}
    secondIcon={IconUpOutline}
    secondAction={camSettings}
    separate
  />
{/if}
