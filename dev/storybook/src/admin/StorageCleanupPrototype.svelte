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
  import { Button } from '@hcengineering/ui/kit'
  import { onDestroy } from 'svelte'
  import StorageCleanup from '../../../../plugins/admin-resources/src/components/StorageCleanup.svelte'
  import registerStrings from '../../../../plugins/admin-assets/src/lang'

  registerStrings()
  export let initialStatus: 'initial' | 'ready' | 'failed' = 'initial'

  const summary = {
    objects: 300,
    bytes: 2_500_000_000,
    byType: [
      { contentType: 'video/mp4', count: 20, bytes: 1_240_000_000 },
      { contentType: 'audio/ogg', count: 180, bytes: 860_000_000 },
      { contentType: 'image/jpeg', count: 100, bytes: 400_000_000 }
    ]
  }
  // Synthetic data must stay internally consistent when the example changes.
  console.assert(summary.byType.reduce((sum, row) => sum + row.count, 0) === summary.objects)
  console.assert(summary.byType.reduce((sum, row) => sum + row.bytes, 0) === summary.bytes)
  const base = {
    id: 'demo-scan',
    action: 'scan' as const,
    actor: 'demo-admin',
    createdOn: 1_700_000_000_000,
    updatedOn: 1_700_000_000_000
  }
  let job: StorageCleanupJob | undefined =
    initialStatus === 'initial'
      ? undefined
      : {
          ...base,
          status: initialStatus,
          result:
            initialStatus === 'ready'
              ? { jobId: base.id, status: 'ready', summary }
              : { jobId: base.id, status: 'failed', error: 'Synthetic failure' }
        }
  let confirming = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function run (action: 'scan' | 'delete'): void {
    confirming = false
    const pendingJob: StorageCleanupJob = {
      ...base,
      action,
      id: action === 'scan' ? 'demo-scan' : 'demo-delete',
      status: 'queued'
    }
    job = pendingJob
    timer = setTimeout(() => {
      job = { ...pendingJob, status: 'running' }
      timer = setTimeout(() => {
        job = {
          ...pendingJob,
          status: action === 'scan' ? 'ready' : 'completed',
          result: {
            jobId: pendingJob.id,
            status: action === 'scan' ? 'ready' : 'completed',
            summary,
            deletedCount: action === 'delete' ? summary.objects : undefined,
            deletedBytes: action === 'delete' ? summary.bytes : undefined
          }
        }
      }, 600)
    }, 400)
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

<div class="prototype">
  <div class="notice"><b>Прототип</b> / Синтетические данные. Все действия локальные, файлы не удаляются.</div>
  <StorageCleanup
    {job}
    canDelete
    on:scan={() => {
      run('scan')
    }}
    on:cleanup={() => {
      confirming = true
    }}
  />
  {#if confirming}
    <section aria-label="Демонстрация подтверждения" class="confirmation">
      <h3>Подтверждение очистки</h3>
      <p>В админке здесь открывается стандартное подтверждение кодом администратора.</p>
      <p>В прототипе код не отправляется. Нажатие покажет только пример выполнения задания.</p>
      <div class="actions">
        <Button
          kind="negative"
          size="medium"
          on:click={() => {
            run('delete')
          }}>Подтвердить демо-очистку</Button
        ><Button
          size="medium"
          on:click={() => {
            confirming = false
          }}>Отмена</Button
        >
      </div>
    </section>
  {/if}
</div>

<style>
  .prototype {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px;
    color: var(--theme-content-color);
  }
  .notice {
    margin: 0 12px 24px;
    font-size: 12px;
    color: var(--theme-halfcontent-color);
  }
  .confirmation {
    margin: 12px;
    border: 1px solid var(--theme-divider-color, #8883);
    padding: 20px;
    border-radius: 8px;
  }
  h3 {
    font-size: 15px;
    margin-top: 0;
  }
  p {
    font-size: 13px;
    line-height: 1.6;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
</style>
