<!--
// Submenu of the context menu: pick a reason and the report is filed (see report.ts).
-->
<script lang="ts">
  import { type ContentReportReason, contentReportReasons } from '@hcengineering/chunter'
  import type { Doc } from '@hcengineering/core'
  import { SelectPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import { fileReport, reasonLabels, reportTarget } from '../report'

  export let value: Doc | Doc[]

  const dispatch = createEventDispatcher()
  let progress = false

  $: object = Array.isArray(value) ? value[0] : value

  async function select (reason: ContentReportReason | undefined): Promise<void> {
    const target = reportTarget(object)
    if (reason == null || target === undefined) {
      dispatch('close')
      return
    }
    try {
      progress = true
      await fileReport(target, reason)
      dispatch('close', reason)
    } finally {
      progress = false
    }
  }
</script>

<SelectPopup
  value={contentReportReasons.map((id) => ({ id, label: reasonLabels[id] }))}
  on:close={(evt) => {
    void select(evt.detail)
  }}
  loading={progress}
  searchable={false}
  width="medium"
  size="small"
  embedded={false}
  on:changeContent
/>
