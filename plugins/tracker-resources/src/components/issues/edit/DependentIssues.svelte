<script lang="ts">
  import { Issue } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { Class, Doc, Ref, RelatedDocument } from '@hcengineering/core'
  import tracker from '../../../plugin'
  import QueryIssuesList from './QueryIssuesList.svelte'
  import { createQuery } from '@hcengineering/presentation'
  import { onDestroy } from 'svelte'
  import { Viewlet } from '@hcengineering/view'

  export let issue: Issue

  function getIssueIds (docs: RelatedDocument[] | RelatedDocument | undefined): Ref<Issue>[] {
    if (docs == null) return []

    if (Array.isArray(docs)) {
      return docs.map((r) => r._id as Ref<Issue>)
    }

    return [docs._id as Ref<Issue>]
  }

  $: blockedByIssueIds = getIssueIds(issue.blockedBy)
  $: relatedIssueIds = getIssueIds(issue.relations)

  $: blockedByQuery = { _id: { $in: blockedByIssueIds } }
  $: relatedQuery = { _id: { $in: relatedIssueIds } }

  let blockedByIssuesCount = 0
  let relatedToIssuesCount = 0
  let blocksIssuesCount = 0

  let blocksIssueIds: Ref<Issue>[] = []
  $: blocksQuery = { _id: { $in: blocksIssueIds } }
  $: isAnyBlocksIssueExists = blocksIssueIds.length > 0

  const blocksIdsQuery = createQuery()
  $: if (issue._id !== undefined) {
    blocksIdsQuery.query(tracker.class.Issue, { blockedBy: { _id: issue._id, _class: issue._class } }, (result) => {
      blocksIssueIds = result.map((r) => r._id)
    })
  }

  onDestroy(() => {
    blocksIdsQuery.unsubscribe()
  })

  function createRemoveButtonConfig (
    type: 'blockedBy' | 'relations' | 'isBlocking'
  ): Record<Ref<Class<Doc>>, Viewlet['config']> {
    return {
      [tracker.class.Issue as Ref<Class<Doc>>]: [
        {
          key: 'actions',
          label: tracker.string.RemoveRelation,
          presenter: tracker.component.RemoveRelationButton,
          props: {
            parentIssue: issue,
            type
          }
        }
      ]
    }
  }

  // Stable refs: rebuild only when issue changes, not every render
  $: blockedByConfig = createRemoveButtonConfig('blockedBy')
  $: relatedConfig = createRemoveButtonConfig('relations')
  $: blocksConfig = createRemoveButtonConfig('isBlocking')
</script>

{#if blockedByIssueIds.length > 0}
  <div class="mt-6">
    <QueryIssuesList
      object={issue}
      query={blockedByQuery}
      createParams={{}}
      hasSubIssues={true}
      showCreateButton={false}
      additionalConfig={blockedByConfig}
      on:docs={(evt) => {
        blockedByIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label label={tracker.string.BlockedByIssuesList} params={{ blockedByIssues: blockedByIssuesCount }} />
      </svelte:fragment>
    </QueryIssuesList>
  </div>
{/if}

{#if relatedIssueIds.length > 0}
  <div class="mt-6">
    <QueryIssuesList
      object={issue}
      query={relatedQuery}
      createParams={{}}
      hasSubIssues={true}
      showCreateButton={false}
      additionalConfig={relatedConfig}
      on:docs={(evt) => {
        relatedToIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label label={tracker.string.RelatedToIssuesList} params={{ relatedToIssue: relatedToIssuesCount }} />
      </svelte:fragment>
    </QueryIssuesList>
  </div>
{/if}

{#if isAnyBlocksIssueExists}
  <div class="mt-6">
    <QueryIssuesList
      object={issue}
      query={blocksQuery}
      createParams={{}}
      hasSubIssues={true}
      showCreateButton={false}
      additionalConfig={blocksConfig}
      on:docs={(evt) => {
        blocksIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label label={tracker.string.BlocksIssuesList} params={{ blocksIssues: blocksIssuesCount }} />
      </svelte:fragment>
    </QueryIssuesList>
  </div>
{/if}
