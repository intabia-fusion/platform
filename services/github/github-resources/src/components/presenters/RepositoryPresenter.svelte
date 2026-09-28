<!--
//
// Copyright © 2023 Hardcore Engineering Inc.
//
-->
<script lang="ts">
  import { Icon } from '@hcengineering/ui'
  import type { GithubIntegrationRepository } from '@hcengineering/github'
  import github from '../../plugin'

  export let value: GithubIntegrationRepository
</script>

<div class="flex-row-center">
  <Icon icon={github.icon.GithubRepository} size={'small'} />
  <span class="ml-1">{value.name}</span>
</div>
