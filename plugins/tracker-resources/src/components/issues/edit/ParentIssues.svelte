<script lang="ts">
  import { Issue } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import tracker from '../../../plugin'
  import { Ref } from '@hcengineering/core'
  import QueryIssuesList from './QueryIssuesList.svelte'

  export let issue: Issue
  let parentIds: Ref<Issue>[] = []

  $: parentIds = issue.parents?.map(p => p.parentId) ?? []

  $: parentQuery = issue.parents?.length > 0
    ? { _id: { $in: issue.parents.map(p => p.parentId) } }
    : {}
</script>

{#if parentIds.length > 0}
  <div class="mt-6">
      <QueryIssuesList
        object={issue}
        query={parentQuery}
        createParams={{}}
        createLabel={tracker.string.AddIssue}
        hasSubIssues={true}
        viewletId={tracker.viewlet.SubIssues}
        showCreateButton={false}
      >
        <svelte:fragment slot="chevron">
          <Label label={tracker.string.ParentIssuesList} params={{ parentIssues: parentIds.length }} />
        </svelte:fragment>
      </QueryIssuesList>
  </div>
{/if}
