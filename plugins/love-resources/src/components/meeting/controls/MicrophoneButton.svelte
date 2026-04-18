<script lang="ts">
  import love from '../../../plugin'
  import { state, toggleMicState } from '@intabiafusion/media-resources'
  import { eventToHTMLElement, IconUpOutline, showPopup, SplitButton } from '@intabiafusion/ui'
  import view from '@intabiafusion/view'
  import { getClient } from '@intabiafusion/presentation'
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

<SplitButton
  {size}
  icon={isMicEnabled ? love.icon.MicEnabled : love.icon.MicDisabled}
  showTooltip={{
    label: isMicEnabled ? love.string.Mute : love.string.UnMute,
    keys: micKeys
  }}
  action={toggleMicState}
  secondIcon={IconUpOutline}
  secondAction={micSettings}
  separate
/>
