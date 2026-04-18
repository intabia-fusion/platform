<script lang="ts">
  import { themeStore } from '@intabiafusion/theme'
  import { updateCustomEmojis, updateUnicodeEmojis } from '../utils'
  import emojiPlugin from '@intabiafusion/emoji'
  import { createQuery } from '@intabiafusion/presentation'
  let parentElement: HTMLDivElement

  const customEmojisQuery = createQuery()
  $: customEmojisQuery.query(emojiPlugin.class.CustomEmoji, {}, (res) => {
    updateCustomEmojis(res)
  })

  $: void updateUnicodeEmojis($themeStore.language)
</script>

<div bind:this={parentElement} class="hidden"></div>
