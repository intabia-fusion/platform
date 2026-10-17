<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import emojiPlugin from '@hcengineering/emoji'
  import { EmojiPresenter } from '@hcengineering/emoji-resources'
  import { createQuery } from '@hcengineering/presentation'
  import type { DocReaction } from '@hcengineering/rating'
  import ratingPlugin, { ReactionKind } from '@hcengineering/rating'
  import { Icon, tooltip } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import StarMark from './StarMark.svelte'
  import { getQuickReactions, hasMyStar, openEmojiPopup, toggleEmoji, toggleStar } from '../reactions'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let readonly = false

  let reactions: DocReaction[] | undefined = undefined
  const query = createQuery()
  $: query.query(ratingPlugin.class.DocReaction, { attachedTo: _id, attachedToClass: _class }, (result) => {
    reactions = result
  })

  $: starred = hasMyStar(reactions ?? [])
  $: starCount = (reactions ?? []).filter((it) => it.reactionType === ReactionKind.Star && it.value === 1).length
  $: quick = getQuickReactions(reactions ?? [])
  $: disabled = readonly || reactions === undefined
  // Sparks fly out of the star on hover, one per gap between its rays
  const sparkles = [18, 90, 162, 234, 306]
  const dispatch = createEventDispatcher()

  // One reaction per opening: the bar closes once something is chosen
  function addEmoji (event: MouseEvent): void {
    openEmojiPopup({ _id, _class }, reactions, event.currentTarget as HTMLElement, () => dispatch('close'))
  }
</script>

<!-- A quick reaction bar: the star leads, emoji follow -->
<div class="reaction-bar">
  <button
    class="reaction-bar__star"
    class:on={starred}
    {disabled}
    data-id="btnPopupStar"
    use:tooltip={{ label: starred ? ratingPlugin.string.RemoveStar : ratingPlugin.string.AddStar }}
    on:click={() => {
      void toggleStar({ _id, _class }, reactions)
      dispatch('close')
    }}
  >
    <span class="reaction-bar__star-icon"><StarMark on={starred} amber /></span>
    {#each sparkles as angle}<span class="reaction-bar__sparkle" style:--angle="{angle}deg" />{/each}
    {#if starCount > 0}<span class="reaction-bar__badge">{starCount}</span>{/if}
  </button>
  <span class="reaction-bar__divider" />
  {#each quick as item (item.text)}
    <button
      class="reaction-bar__emoji"
      class:mine={item.mine}
      {disabled}
      on:click={() => {
        void toggleEmoji({ _id, _class }, item, reactions)
        dispatch('close')
      }}
    >
      <EmojiPresenter emoji={item.text} />
      {#if item.count > 0}<span class="reaction-bar__badge">{item.count}</span>{/if}
    </button>
  {/each}
  {#if !readonly}
    <button
      class="reaction-bar__more"
      data-id="btnPopupAddReaction"
      use:tooltip={{ label: ratingPlugin.string.AddReaction }}
      on:click={addEmoji}
    >
      <Icon icon={emojiPlugin.icon.EmojiAdd} size="medium" />
    </button>
  {/if}
</div>

<style lang="scss">
  .reaction-bar {
    --_spring: cubic-bezier(0.3, 1.6, 0.6, 1);
    display: flex;
    align-items: center;
    gap: var(--spacing-0_25);
    padding: var(--spacing-0_5);
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 1.5rem;
    box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
      var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);

    // :where keeps the base low so the parts below can override it
    :where(button) {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      color: var(--global-primary-TextColor);
      background: transparent;
      border: none;
      border-radius: 1.125rem;
      cursor: pointer;
      transition:
        transform 0.15s var(--_spring),
        background-color 0.15s ease;

      &:hover:not(:disabled),
      &:focus-visible {
        background: var(--global-ui-hover-BackgroundColor);
      }
      &:disabled {
        cursor: default;
      }
    }

    // Drawn star on an amber disc: outlined until set, filled gold once set
    &__star {
      --_amber: #e5a400;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background: color-mix(in srgb, var(--_amber) 10%, transparent);

      &:hover:not(:disabled),
      &:focus-visible {
        background: color-mix(in srgb, var(--_amber) 20%, transparent);

        :global(.star-mark:not(.on)) {
          fill: color-mix(in srgb, var(--_amber) 30%, transparent);
        }
      }
      &.on {
        background: color-mix(in srgb, var(--_amber) 22%, transparent);
      }
    }
    &__star-icon {
      display: flex;

      :global(.star-mark) {
        width: 1.5rem;
        height: 1.5rem;
      }
    }
    // Hover: the star turns by one ray with a spring and sparks burst out of it
    &__star:hover:not(:disabled) &__star-icon {
      animation: star-twirl 0.6s var(--_spring) forwards;
    }
    &__sparkle {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0.25rem;
      height: 0.25rem;
      margin: -0.125rem 0 0 -0.125rem;
      border-radius: 50%;
      background: var(--_amber);
      opacity: 0;
      pointer-events: none;
    }
    &__star:hover:not(:disabled) &__sparkle {
      animation: sparkle-burst 0.6s ease-out;
    }
    &__divider {
      align-self: stretch;
      width: 1px;
      margin: var(--spacing-0_5) var(--spacing-0_25);
      background: var(--theme-popup-divider);
    }
    &__emoji {
      font-size: 1.25rem;

      &:hover:not(:disabled) {
        transform: scale(1.25) translateY(-0.125rem);
      }
      &.mine {
        background: var(--global-accent-SkyText);
      }
    }
    &__badge {
      position: absolute;
      right: -0.125rem;
      bottom: -0.125rem;
      min-width: 1rem;
      padding: 0 0.25rem;
      font-size: 0.625rem;
      font-weight: 500;
      line-height: 1rem;
      color: var(--global-primary-TextColor);
      background: var(--theme-popup-color);
      border: 1px solid var(--theme-popup-divider);
      border-radius: 0.5rem;
    }
    &__more {
      color: var(--global-secondary-TextColor);
    }
  }

  @keyframes star-twirl {
    0% {
      transform: rotate(0) scale(1);
    }
    60% {
      transform: rotate(84deg) scale(1.25);
    }
    100% {
      transform: rotate(72deg) scale(1.12);
    }
  }
  @keyframes sparkle-burst {
    0% {
      opacity: 1;
      transform: rotate(var(--angle)) translateY(-0.5rem) scale(0.4);
    }
    100% {
      opacity: 0;
      transform: rotate(var(--angle)) translateY(-1.5rem) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-bar :where(button),
    .reaction-bar__star:hover .reaction-bar__star-icon,
    .reaction-bar__star:hover .reaction-bar__sparkle {
      transition: none;
      animation: none;
    }
    .reaction-bar__emoji:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
