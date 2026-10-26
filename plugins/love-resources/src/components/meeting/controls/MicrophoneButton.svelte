<script lang="ts">
  import { state, toggleMicState } from '@hcengineering/media-resources'
  import ui, { eventToHTMLElement, showPopup, SplitButton } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { getClient } from '@hcengineering/presentation'

  import love from '../../../plugin'
  import MicSettingPopup from '../MicSettingPopup.svelte'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'
  export let checkActions: boolean = true

  $: isMicEnabled = $state.microphone?.enabled === true

  const micKeys = checkActions
    ? getClient().getModel().findAllSync(view.class.Action, { _id: love.action.ToggleMic })?.[0]?.keyBinding
    : ['Alt+D']

  function micSettings (e: MouseEvent): void {
    showPopup(MicSettingPopup, {}, eventToHTMLElement(e))
  }
</script>

<div data-id="mic-button" data-enabled={isMicEnabled ? 'true' : 'false'} style="display: contents">
  <SplitButton
    {size}
    icon={isMicEnabled ? love.icon.MicEnabled : love.icon.MicDisabled}
    iconProps={{ fill: isMicEnabled ? 'var(--theme-state-positive-color)' : 'var(--theme-error-color)' }}
    showTooltip={{
      label: isMicEnabled ? love.string.Mute : love.string.UnMute,
      keys: micKeys
    }}
    action={toggleMicState}
    secondIcon={ui.icon.ChevronUpSmall}
    secondAction={micSettings}
    separate
  />
</div>
