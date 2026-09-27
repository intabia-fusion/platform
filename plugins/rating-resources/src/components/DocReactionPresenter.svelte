<script lang="ts">
  import type { DocReaction } from '@hcengineering/rating'
  import ratingPlugin, { ReactionKind } from '@hcengineering/rating'
  import { Icon } from '@hcengineering/ui'
  import ReactionPresenter from './ReactionPresenter.svelte'

  export let value: DocReaction | null = null
</script>

{#if value}
  {#if value.reactionType === ReactionKind.Star}
    <Icon icon={ratingPlugin.icon.StarYellow} size={'small'} />
  {:else}
    <ReactionPresenter emoji={value?.emoji ?? ''} />
  {/if}
{/if}
