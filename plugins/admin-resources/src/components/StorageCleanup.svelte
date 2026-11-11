<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { StorageCleanupJob } from '@hcengineering/core'
  import { createEventDispatcher } from 'svelte'
  import { Label, themeStore } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import adminRes from '../plugin'

  export let job: StorageCleanupJob | undefined = undefined
  export let loading = false
  export let error = false
  export let canDelete = false

  const dispatch = createEventDispatcher<{ scan: undefined, cleanup: undefined }>()
  $: pending = job?.status === 'queued' || job?.status === 'running'
  $: summary = job?.action === 'scan' ? job.result?.summary : undefined
  $: statusLabel =
    job?.status === 'queued'
      ? adminRes.string.StorageQueued
      : job?.status === 'running'
        ? adminRes.string.StorageRunning
        : job?.status === 'ready'
          ? adminRes.string.StorageReady
          : job?.status === 'completed'
            ? adminRes.string.StorageCompleted
            : adminRes.string.StorageFailed
  $: numberFormat = new Intl.NumberFormat($themeStore.language, { maximumFractionDigits: 3 })
</script>

<div class="storage-cleanup">
  <h2><Label label={adminRes.string.Storage} /></h2>
  <p class="content-dark-color"><Label label={adminRes.string.StorageEligibility} /></p>
  {#if error || job?.status === 'failed'}
    <p class="error-color" role="alert"><Label label={adminRes.string.StorageFailed} /></p>
  {/if}
  {#if job !== undefined}
    <p role="status" aria-live="polite"><Label label={statusLabel} /></p>
  {/if}
  {#if job?.action === 'delete' && job.status === 'completed'}
    <div class="summary">
      <div>
        <span class="content-dark-color"><Label label={adminRes.string.StorageFreed} /></span><strong
          >{numberFormat.format((job.result?.deletedBytes ?? 0) / 1_000_000_000)} GB</strong
        >
      </div>
      <div>
        <span class="content-dark-color"><Label label={adminRes.string.StorageObjects} /></span><strong
          >{numberFormat.format(job.result?.deletedCount ?? 0)}</strong
        >
      </div>
    </div>
  {/if}
  {#if summary !== undefined}
    <div class="summary">
      <div>
        <span class="content-dark-color"><Label label={adminRes.string.StorageCanFree} /></span><strong
          >{numberFormat.format(summary.bytes / 1_000_000_000)} GB</strong
        >
      </div>
      <div>
        <span class="content-dark-color"><Label label={adminRes.string.StorageObjects} /></span><strong
          >{numberFormat.format(summary.objects)}</strong
        >
      </div>
    </div>
    <table>
      <thead><tr><th>MIME</th><th><Label label={adminRes.string.StorageObjects} /></th><th>GB</th></tr></thead>
      <tbody>
        {#each summary.byType as row}
          <tr
            ><td>{row.contentType}</td><td>{numberFormat.format(row.count)}</td><td
              >{numberFormat.format(row.bytes / 1_000_000_000)}</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
    {#if summary.objects === 0}<p><Label label={adminRes.string.StorageEmpty} /></p>{/if}
  {/if}
  <div class="actions">
    <Button
      kind="primary"
      size="medium"
      {loading}
      disabled={loading || pending}
      label={adminRes.string.StorageCalculate}
      on:click={() => dispatch('scan')}
    />
    {#if job?.action === 'scan' && job.status === 'ready' && summary !== undefined && summary.objects > 0 && canDelete}
      <Button
        kind="negative"
        size="medium"
        disabled={loading}
        label={adminRes.string.StorageClean}
        on:click={() => dispatch('cleanup')}
      />
    {/if}
  </div>
  {#if job?.action === 'scan' && job.status === 'ready' && summary !== undefined && summary.objects > 0}
    <p class="content-dark-color"><Label label={adminRes.string.StorageConfirmHint} /></p>
  {/if}
</div>

<style>
  .storage-cleanup {
    max-width: 800px;
    padding: 12px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
  }
  p {
    font-size: 13px;
    line-height: 1.6;
    margin: 12px 0;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 48px;
    padding: 24px 0;
  }
  .summary > div {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }
  strong {
    font-size: 28px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 13px;
  }
  th,
  td {
    text-align: right;
    padding: 12px 0;
    border-bottom: 1px solid var(--theme-divider-color, #8883);
    font-variant-numeric: tabular-nums;
  }
  th {
    font-weight: 500;
    color: var(--theme-halfcontent-color);
  }
  th:first-child,
  td:first-child {
    text-align: left;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
