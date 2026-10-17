<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { EmojiPresenter } from '@hcengineering/emoji-resources'
  import { createQuery } from '@hcengineering/presentation'
  import type { DocReaction } from '@hcengineering/rating'
  import ratingPlugin, { ReactionKind } from '@hcengineering/rating'
  import { showPopup, tooltip } from '@hcengineering/ui'

  import { hasMyStar } from '../reactions'
  import ReactionsPopup from './ReactionsPopup.svelte'
  import StarMark from './StarMark.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let readonly = false
  export let showMy = true

  export let reactions: DocReaction[] = []

  let _reactions = reactions
  let loaded = reactions.length > 0

  const reactionsQuery = createQuery()
  $: if (reactions.length === 0) {
    reactionsQuery.query(ratingPlugin.class.DocReaction, { attachedTo: _id, attachedToClass: _class }, (result) => {
      _reactions = result
      loaded = true
    })
  } else {
    reactionsQuery.unsubscribe()
    _reactions = reactions
  }

  // The popup closes on choice, so the header star pops when it gets set
  $: starred = hasMyStar(_reactions)
  let lastStarred: boolean | undefined
  let popped = false
  $: if (loaded && starred !== lastStarred) {
    popped = lastStarred === false && starred
    lastStarred = starred
  }

  $: starCount = _reactions.filter((it) => it.reactionType === ReactionKind.Star && it.value === 1).length
  $: emoji = _reactions.filter((it) => it.reactionType === ReactionKind.Emoji && it.emoji !== undefined)
  $: topEmoji = mostUsed(emoji)

  // Up to three distinct emoji, the most used first
  function mostUsed (items: DocReaction[]): string[] {
    const counts = new Map<string, number>()
    for (const it of items) counts.set(it.emoji ?? '', (counts.get(it.emoji ?? '') ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([text]) => text)
  }

  // Pressed while the popup is open, like a kit button with its menu open
  let popupOpened = false

  function openReactions (event: MouseEvent): void {
    popupOpened = true
    showPopup(ReactionsPopup, { _id, _class, readonly }, event.currentTarget as HTMLElement, () => {
      popupOpened = false
    })
  }
</script>

<!-- One summary button: stars and emoji together, the popup sets them -->
<button
  class="reactions-summary"
  class:pressed={popupOpened}
  data-id="btnReactions"
  use:tooltip={{ label: ratingPlugin.string.Reactions }}
  on:click|stopPropagation={openReactions}
>
  {#key starred}<StarMark on={starred} pop={popped} />{/key}
  {#if showMy && starCount > 0}<span class="reactions-summary__count">{starCount}</span>{/if}
  {#if showMy && topEmoji.length > 0}
    <!-- No total: the emoji speak for themselves, the counts are in the popup -->
    <span class="reactions-summary__emoji">
      {#each topEmoji as text (text)}<span><EmojiPresenter emoji={text} /></span>{/each}
    </span>
  {/if}
</button>

<style lang="scss">
  // Matches a small ghost kit button, with room for the star and the emoji stack
  .reactions-summary {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_5);
    height: var(--global-small-Size);
    padding: 0 var(--spacing-1);
    font-family: var(--font-family);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1rem;
    white-space: nowrap;
    color: var(--global-secondary-TextColor);
    background: transparent;
    border: none;
    border-radius: var(--small-BorderRadius);
    cursor: pointer;

    & > :global(*) {
      pointer-events: none;
    }
    &:hover {
      color: var(--global-primary-IconColor);
      background-color: var(--button-tertiary-hover-BackgroundColor);
    }
    &:active,
    &.pressed {
      color: var(--global-primary-IconColor);
      background-color: var(--button-tertiary-active-BackgroundColor);
    }
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }

    &__count {
      color: var(--global-primary-TextColor);
    }
    // One group set apart from the star, so the star count reads as its own
    &__emoji {
      display: flex;
      align-items: center;
      margin-left: var(--spacing-1);
      gap: 0.125rem;
      font-size: 1rem;
    }
  }
</style>
