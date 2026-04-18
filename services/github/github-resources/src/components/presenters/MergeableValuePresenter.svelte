<script lang="ts">
  import { Label } from '@intabiafusion/ui'
  import { PullRequestMergeable } from '@intabiafusion/github'
  import github from '../../plugin'

  export let value: PullRequestMergeable
  export let accent = false
</script>

<div class="p-1" class:fs-bold={accent}>
  {#if value === PullRequestMergeable.CONFLICTING}
    <Label label={github.string.Conflict} />
  {:else if value === PullRequestMergeable.MERGEABLE}
    <Label label={github.string.ReadyForMerge} />
  {/if}
</div>
