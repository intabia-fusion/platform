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
  import type { RegionInfo } from '@hcengineering/account-client'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { Card } from '@hcengineering/presentation'
  import { ButtonMenu, EditBox, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import adminRes from '../plugin'
  import { getAccountClient, getRegionInfo } from '../utils'

  const dispatch = createEventDispatcher()
  const accountClient = getAccountClient()

  let name = ''
  let regionInfo: RegionInfo[] = []
  let region = ''
  let creating = false
  let failed = false

  void getRegionInfo().then((r) => {
    regionInfo = r ?? []
  })

  async function create (): Promise<void> {
    if (creating || name.trim().length === 0) return
    creating = true
    failed = false
    try {
      await accountClient.createWorkspace(name.trim(), region === '' ? undefined : region)
      dispatch('close', true)
    } catch (err) {
      console.error('Failed to create workspace:', err)
      failed = true
    } finally {
      creating = false
    }
  }
</script>

<Card
  label={adminRes.string.CreateWorkspace}
  okLabel={adminRes.string.Create}
  canSave={name.trim().length > 0 && !creating}
  okAction={create}
  on:close={() => dispatch('close', undefined)}
>
  <div class="flex-col">
    {#if failed}
      <div class="error-color mb-2"><Label label={adminRes.string.LoadError} /></div>
    {/if}
    <EditBox bind:value={name} placeholder={adminRes.string.Name} kind={'large-style'} autoFocus />
    {#if regionInfo.length > 0}
      <div class="flex-row-center mt-2">
        <span class="mr-2"><Label label={adminRes.string.Region} />:</span>
        <ButtonMenu
          selected={region === '' ? '#' : region}
          size={'small'}
          label={getEmbeddedLabel(
            region === '' ? 'Default' : (regionInfo.find((r) => r.region === region)?.name ?? region)
          )}
          items={regionInfo.map((r) => ({
            id: r.region === '' ? '#' : r.region,
            label: getEmbeddedLabel(r.name.length > 0 ? r.name : r.region)
          }))}
          on:selected={(it) => {
            region = it.detail === '#' ? '' : it.detail
          }}
        />
      </div>
    {/if}
  </div>
</Card>
