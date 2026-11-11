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
  import type { StorageCleanupJob, StorageCleanupRequest } from '@hcengineering/core'
  import { isAdminUser } from '@hcengineering/presentation'
  import { onDestroy } from 'svelte'
  import { getAccountClient, requestAdminOtpCode } from '../../utils'
  import StorageCleanup from '../StorageCleanup.svelte'

  export let refreshTick = 0

  let job: StorageCleanupJob | undefined
  let loading = false
  let error = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let previousTick = -1
  let retryRequest: StorageCleanupRequest | undefined

  async function load (): Promise<void> {
    if (loading || disposed) return
    clearTimeout(timer)
    loading = true
    try {
      const latest = await getAccountClient().adminGetStorageCleanup(retryRequest?.requestId ?? job?.id)
      if (!disposed) {
        job = latest ?? job
        if (retryRequest === undefined || latest?.id === retryRequest.requestId) {
          retryRequest = undefined
          error = false
        }
      }
    } catch (err) {
      error = true
      console.error('Failed to load storage cleanup', err)
    } finally {
      loading = false
      if (!disposed && (error || job?.status === 'queued' || job?.status === 'running')) {
        timer = setTimeout(() => {
          void load()
        }, 3000)
      }
    }
  }

  async function request (action: 'scan' | 'delete'): Promise<void> {
    if (loading || disposed) return
    const scanId = action === 'delete' ? job?.id : undefined
    if (action === 'delete' && (job?.action !== 'scan' || job.status !== 'ready')) return
    clearTimeout(timer)
    loading = true
    try {
      const otpCode = action === 'delete' ? await requestAdminOtpCode() : undefined
      if (disposed || (action === 'delete' && otpCode === undefined)) return
      // Reuse the id after an uncertain response: the server may already have accepted this request.
      if (retryRequest?.action !== action || retryRequest.scanId !== scanId) {
        retryRequest = { action, scanId, requestId: crypto.randomUUID() }
      }
      job = await getAccountClient().adminRequestStorageCleanup({ ...retryRequest, otpCode })
      retryRequest = undefined
      error = false
    } catch (err) {
      error = true
      console.error('Failed to request storage cleanup', err)
    } finally {
      loading = false
      if (!disposed && error) {
        void load()
      } else if (!disposed && (job?.status === 'queued' || job?.status === 'running')) {
        timer = setTimeout(() => {
          void load()
        }, 3000)
      }
    }
  }

  $: if (refreshTick !== previousTick) {
    previousTick = refreshTick
    void load()
  }

  onDestroy(() => {
    disposed = true
    clearTimeout(timer)
  })
</script>

<StorageCleanup
  {job}
  {loading}
  {error}
  canDelete={isAdminUser()}
  on:scan={() => {
    void request('scan')
  }}
  on:cleanup={() => {
    void request('delete')
  }}
/>
