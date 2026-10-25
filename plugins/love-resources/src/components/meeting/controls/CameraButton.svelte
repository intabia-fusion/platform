<script lang="ts">
  import ui, { eventToHTMLElement, showPopup, SplitButton } from '@hcengineering/ui'
  import { RoomType } from '@hcengineering/love'
  import { state, toggleCamState } from '@hcengineering/media-resources'
  import view from '@hcengineering/view'
  import { getClient } from '@hcengineering/presentation'

  import CamSettingPopup from '../CamSettingPopup.svelte'
  import { currentRoom } from '../../../stores'
  import love from '../../../plugin'

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
    iconProps={{ fill: isCamEnabled ? 'var(--theme-state-positive-color)' : 'var(--theme-error-color)' }}
    showTooltip={{
      label: isCamEnabled ? love.string.StopVideo : love.string.StartVideo,
      keys: camKeys
    }}
    action={toggleCamState}
    secondIcon={ui.icon.ChevronUpSmall}
    secondAction={camSettings}
    separate
  />
{/if}
