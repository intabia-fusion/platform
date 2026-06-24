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
      return docs.map(r => r._id as Ref<Issue>)
    }

    return [docs._id as Ref<Issue>]
  }

  $: blockedByIssueIds = getIssueIds(issue.blockedBy)
  $: relatedIssueIds = getIssueIds(issue.relations)

  $: blockedByQuery = { _id: { $in: blockedByIssueIds } }
  $: relatedQuery = { _id: { $in: relatedIssueIds } }
  $: blocksQuery = issue._id !== undefined && issue._class !== undefined
    ? { blockedBy: { _id: issue._id, _class: issue._class } }
    : { _id: { $in: [] } }

  let blockedByIssuesCount = 0
  let relatedToIssuesCount = 0
  let blocksIssuesCount = 0

  // TODO при добавлении заблокированной задачи, список не обновляется автоматически, только после перезагрузки страницы
  // Заведена задача на доработку FUSIO-952
  const blocksExistsQuery = createQuery()
  let isAnyBlocksIssueExists = false

  $: {
    blocksExistsQuery.query(
      tracker.class.Issue,
      blocksQuery,
      (result) => {
        isAnyBlocksIssueExists = result !== null && result !== undefined && result.length > 0
      },
      { limit: 1 }
    )
  }

  onDestroy(() => {
    blocksExistsQuery.unsubscribe()
  })

  function createRemoveButtonConfig (
    type: 'blockedBy' | 'relations' | 'isBlocking'
  ): Record<Ref<Class<Doc>>, Viewlet['config']> {
    const config: Record<Ref<Class<Doc>>, Viewlet['config']> = {}

    config[tracker.class.Issue as Ref<Class<Doc>>] = [
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

    return config
  }
</script>

{#if blockedByIssueIds.length > 0}
  <div class="mt-6">
    <QueryIssuesList
      object={issue}
      query={blockedByQuery}
      createParams={{}}
      hasSubIssues={true}
      showCreateButton={false}
      additionalConfig={createRemoveButtonConfig('blockedBy')}
      on:docs={(evt) => {
        blockedByIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label
          label={tracker.string.BlockedByIssuesList}
          params={{ blockedByIssues: blockedByIssuesCount }}
        />
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
      additionalConfig={createRemoveButtonConfig('relations')}
      on:docs={(evt) => {
        relatedToIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label
          label={tracker.string.RelatedToIssuesList}
          params={{ relatedToIssue: relatedToIssuesCount }}
        />
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
      additionalConfig={createRemoveButtonConfig('isBlocking')}
      on:docs={(evt) => {
        blocksIssuesCount = evt.detail.length
      }}
    >
      <svelte:fragment slot="chevron">
        <Label
          label={tracker.string.BlocksIssuesList}
          params={{ blocksIssues: blocksIssuesCount }}
        />
      </svelte:fragment>
    </QueryIssuesList>
  </div>
{/if}
