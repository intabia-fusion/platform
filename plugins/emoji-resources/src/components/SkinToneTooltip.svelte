<script lang="ts">
  //
  // © 2025 Hardcore Engineering, Inc. All Rights Reserved.
  // Licensed under the Eclipse Public License v2.0 (SPDX: EPL-2.0).
  //
  import { createEventDispatcher } from 'svelte'
  import { closeTooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'

  import emojiPlugin from '@hcengineering/emoji'
  import type { Emoji } from '@hcengineering/emoji'
  import { skinTones } from '../types'
  import { getEmojiSkins } from '../utils'
  import EmojiGlyph from './EmojiGlyph.svelte'

  export let emoji: Emoji.Emoji
  export let selected: number

  const dispatch = createEventDispatcher()

  let emojiSkins: Emoji.Emoji[] | undefined
  let skins: Emoji.Emoji[] = []

  $: emojiSkins = getEmojiSkins(emoji)
  $: skins = emojiSkins !== undefined ? [emoji, ...emojiSkins] : []
</script>

<div class="flex-row-center flex-gap-1">
  {#each skins as skin, index}
    {@const disabled = selected === index}
    <IconButton
      icon={EmojiGlyph}
      iconProps={{ emoji: skin.emoji, fontSize: '1.5rem' }}
      {disabled}
      kind={disabled ? 'secondary' : 'tertiary'}
      size="small"
      tooltip={{ label: skinTones.get(index) ?? emojiPlugin.string.DefaultSkinTone }}
      on:click={() => {
        if (disabled) return undefined
        dispatch('update', index)
        closeTooltip()
      }}
    />
  {/each}
</div>
