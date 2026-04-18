<!--
//
// Copyright © 2023 Hardcore Engineering Inc.
//
-->
<script lang="ts">
  import { WithLookup } from '@intabiafusion/core'
  import { IssuePresenter } from '@intabiafusion/tracker-resources'
  import github, { GithubPullRequest } from '@intabiafusion/github'

  export let value: WithLookup<GithubPullRequest>
  export let disabled = false
  export let onClick: (() => void) | undefined = undefined
  export let shouldShowAvatar: boolean = false
  export let noUnderline = false
  export let inline = false
  export let kind: 'list' | undefined = undefined
</script>

<IssuePresenter
  {value}
  {disabled}
  {onClick}
  {shouldShowAvatar}
  {noUnderline}
  {inline}
  {kind}
  icon={github.icon.PullRequest}
/>
