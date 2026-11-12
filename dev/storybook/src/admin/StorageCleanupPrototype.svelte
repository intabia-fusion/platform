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
  let currentSummary = initialStatus === 'ready' ? summary : undefined
  let error = initialStatus === 'failed'
  let loading = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function run (): void {
    loading = true
    error = false
    timer = setTimeout(() => {
      currentSummary = summary
      loading = false
    }, 1000)
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

<div class="prototype">
  <div class="notice"><b>Прототип</b> / Синтетические данные. Все действия локальные, файлы не удаляются.</div>
  <StorageCleanup
    summary={currentSummary}
    {loading}
    {error}
    on:scan={() => {
      run()
    }}
  />
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
</style>
