<!--
//
// Copyright © 2023 Hardcore Engineering Inc.
//
-->
<script lang="ts">
  import { WithLookup } from '@intabiafusion/core'
  import { TitlePresenter } from '@intabiafusion/tracker-resources'
  import { GithubPullRequest } from '@intabiafusion/github'

  export let value: WithLookup<GithubPullRequest>
  export let shouldUseMargin: boolean = false
  export let showParent = true
  export let kind: 'list' | undefined = undefined
  export let onClick: (() => void) | undefined = undefined
  export let disabled = false
</script>

{#if value}
  <TitlePresenter {value} {shouldUseMargin} {showParent} {kind} {onClick} {disabled} />
{/if}
