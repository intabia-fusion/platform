<script lang="ts">
  import emojiPlugin from '@hcengineering/emoji'
  import { showPopup } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import love from '../../../plugin'
  import { lk } from '../../../utils'

  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  function addReaction (event: MouseEvent): void {
    showPopup(
      emojiPlugin.component.EmojiPopup,
      {},
      event?.target as HTMLElement,
      async (result) => {
        const emoji = result?.text
        if (emoji == null) return
        void lk.localParticipant.sendChatMessage(emoji, { topic: 'reaction' })
      },
      () => {}
    )
  }
</script>

<IconButton
  iconSize="medium"
  icon={emojiPlugin.icon.Emoji}
  kind="secondary"
  {size}
  tooltip={{ label: love.string.AddReaction }}
  on:click={addReaction}
/>
