<script lang="ts">
  import { PersonId } from '@hcengineering/core'
  import { ObjectPresenter } from '@hcengineering/view-resources'
  import { getPersonRefByPersonIdStore } from '@hcengineering/contact-resources'
  import { EmojiPresenter, getEmojiByUnicode } from '@hcengineering/emoji-resources'
  import { isCustomEmoji } from '@hcengineering/emoji'
  import contact from '@hcengineering/contact'

  export let socialIds: PersonId[] = []
  export let emoji: string

  $: personRefByPersonIdStore = getPersonRefByPersonIdStore(socialIds)
  $: persons = socialIds.map((si) => $personRefByPersonIdStore.get(si))

  let shortCode: string = ''
  $: extendedEmoji = getEmojiByUnicode(emoji)
  $: shortCode =
    extendedEmoji && isCustomEmoji(extendedEmoji) ? extendedEmoji.shortcode : (extendedEmoji?.shortcodes?.[0] ?? '')
</script>

<div class="m-2 flex-col flex-gap-2">
  <div class="emoji">
    <EmojiPresenter {emoji} />
    {#if shortCode}
      <span class="shortcode">
        :{shortCode}:
      </span>
    {/if}
  </div>
  {#each persons as person (person)}
    <ObjectPresenter objectId={person} _class={contact.class.Person} disabled />
  {/each}
</div>

<style lang="scss">
  .emoji {
    font-size: 1.75rem;
    color: var(--global-primary-TextColor);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .shortcode {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--global-secondary-TextColor);
  }
</style>
