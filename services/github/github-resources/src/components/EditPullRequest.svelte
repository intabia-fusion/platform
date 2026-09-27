<!--
// Copyright © 2023 Hardcore Engineering Inc.
//
-->
<script lang="ts">
  import type { GithubPullRequest } from '@hcengineering/github'
  import PullRequestDiff from './PullRequestDiff.svelte'

  export let object: GithubPullRequest
  export let embedded = false
</script>

<div class="mt-6">
  <PullRequestDiff pullRequest={object} />
</div>
