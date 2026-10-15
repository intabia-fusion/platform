<script lang="ts">
  import type { IdMap, Ref, Timestamp, Tx, WithLookup } from '@hcengineering/core'
  import core from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import type { Issue, IssueStatus } from '@hcengineering/tracker'
  import { Label, Row, ticker } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import Duration from './Duration.svelte'
  import { calcStatusDurations } from './statusHistory'
  import StatusPresenter from './StatusPresenter.svelte'

  export let issue: Issue
  export let accentHeader: boolean = false

  const query = createQuery()

  let txes: Tx[] = []

  interface WithTime {
    status: WithLookup<IssueStatus>
    duration: number
  }

  $: query.query(
    core.class.Tx,
    { objectId: issue._id },
    (res) => {
      txes = res
    },
    { sort: { modifiedOn: 1 } }
  )

  let displaySt: WithTime[] = []
  function updateStatus (
    txes: Tx[],
    statuses: IdMap<IssueStatus>,
    status: Ref<IssueStatus>,
    modifiedOn: Timestamp,
    _: number
  ): void {
    const result: WithTime[] = []
    for (const it of calcStatusDurations(txes, status, modifiedOn, Date.now())) {
      const st = statuses.get(it.status)
      // The status may be removed by a status merge
      if (st !== undefined) result.push({ status: st, duration: it.duration })
    }
    displaySt = result
  }

  $: updateStatus(txes, $statusStore.byId, issue.status, issue.modifiedOn, $ticker)
</script>

<Row>
  <span class="label" class:fs-bold={accentHeader} class:content-dark-color={accentHeader}>
    <Label label={tracker.string.StatusHistory} />:
  </span>
</Row>
{#each displaySt as st}
  <StatusPresenter value={st.status} taskType={issue.kind} space={issue.space} />
  <Duration value={st.duration} />
{/each}
