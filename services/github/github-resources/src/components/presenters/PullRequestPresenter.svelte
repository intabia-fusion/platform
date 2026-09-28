<!--
//
// Copyright © 2023 Hardcore Engineering Inc.
//
-->
<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import { IssuePresenter } from '@hcengineering/tracker-resources'
  import type { GithubPullRequest } from '@hcengineering/github'
  import github from '@hcengineering/github'

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
