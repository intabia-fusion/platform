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
  import { concatLink, type StorageCleanupSummary } from '@hcengineering/core'
  import { getMetadata } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import StorageCleanup from '../StorageCleanup.svelte'

  export let refreshTick = 0
  let summary: StorageCleanupSummary | undefined
  let loading = false
  let error = false
  let previousTick = -1

  async function load (): Promise<void> {
    if (loading) return
    loading = true
    try {
      const url = getMetadata(presentation.metadata.DatalakeUrl)
      if (url === undefined || url.length === 0) throw new Error('Datalake URL is missing')
      const token = getMetadata(presentation.metadata.Token)
      if (token === undefined) throw new Error('Admin token is missing')
      const response = await fetch(concatLink(url, '/admin/storage/unused'), {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error(`Storage estimate failed: ${response.status}`)
      summary = await response.json()
      error = false
    } catch (err) {
      error = true
      console.error('Failed to load storage estimate', err)
    } finally {
      loading = false
    }
  }

  $: if (refreshTick !== previousTick) {
    previousTick = refreshTick
    void load()
  }
</script>

<StorageCleanup
  {summary}
  {loading}
  {error}
  on:scan={() => {
    void load()
  }}
/>
