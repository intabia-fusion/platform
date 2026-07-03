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
  import { type AccountAggregatedInfo } from '@hcengineering/account-client'
  import { type AccountUuid, reduceCalls } from '@hcengineering/core'
  import { copyTextToClipboard } from '@hcengineering/presentation'
  import { Button, CheckBox, IconCopy, IconDetails, IconStop, Label, SearchEdit, showPopup } from '@hcengineering/ui'

  import adminRes from '../../plugin'
  import AccountDetails from '../AccountDetails.svelte'
  import { getAccountClient, requestAdminOtpCode } from '../../utils'

  export let refreshTick: number = 0

  const accountClient = getAccountClient()

  let accountSuperAdminMode = false

  let accountSearch = ''
  let accountSkip = 0
  const accountLimit = 25
  let accounts: AccountAggregatedInfo[] = []

  const loadAccounts = reduceCalls(async (search?: string, skip?: number, limit?: number): Promise<void> => {
    accounts = await accountClient.listAccounts(search, skip, limit)
  })

  let prevTick = -1
  $: if (refreshTick !== prevTick) {
    prevTick = refreshTick
    void loadAccounts(accountSearch, accountSkip, accountLimit)
  }

  // Account deletion is an irreversible identity purge -> OTP-gated on the server
  function deleteAccount (uuid: AccountUuid): void {
    void requestAdminOtpCode().then((code) => {
      if (code === undefined) return
      void accountClient
        .deleteAccount(uuid, code)
        .then(() => loadAccounts(accountSearch, accountSkip, accountLimit))
        .catch((err) => {
          console.error('Failed to delete account:', err)
        })
    })
  }

  async function accountSearchChanged (ev: CustomEvent<string>): Promise<void> {
    accountSkip = 0
    await loadAccounts(ev.detail, accountSkip, accountLimit)
  }

  function primaryEmail (account: AccountAggregatedInfo): string {
    return account.socialIds.find((s) => s.type === 'email')?.value ?? account.socialIds[0]?.value ?? '-'
  }
</script>

<div class="flex-between">
  <div class="fs-title p-3"><Label label={adminRes.string.AccountsAdminTitle} /></div>
  <div class="flex-row-center">
    <span class="mr-4"><Label label={adminRes.string.EnableDeletion} /></span>
    <CheckBox bind:checked={accountSuperAdminMode} />
  </div>
</div>
<div class="fs-title p-3 flex-no-shrink">
  <SearchEdit bind:value={accountSearch} width={'100%'} on:change={accountSearchChanged} />
</div>

<div class="flex-row-center p-3">
  <Button
    label={adminRes.string.Previous}
    size={'small'}
    disabled={accountSkip === 0}
    on:click={async () => {
      accountSkip = Math.max(0, accountSkip - accountLimit)
      await loadAccounts(accountSearch, accountSkip, accountLimit)
    }}
  />
  <span class="mx-2"><Label label={adminRes.string.Page} /> {Math.floor(accountSkip / accountLimit) + 1}</span>
  <Button
    label={adminRes.string.Next}
    size={'small'}
    disabled={accounts.length < accountLimit}
    on:click={async () => {
      accountSkip += accountLimit
      await loadAccounts(accountSearch, accountSkip, accountLimit)
    }}
  />
</div>

<div class="p-3 select-text-i">
  <table class="accounts-table">
    <thead>
      <tr>
        <th><Label label={adminRes.string.Accounts} /></th>
        <th><Label label={adminRes.string.Email} /></th>
        <th><Label label={adminRes.string.SocialIds} /></th>
        <th><Label label={adminRes.string.Workspaces} /></th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each accounts as account}
        <tr class="focused-button">
          <td>
            <div class="fs-title">{account.firstName} {account.lastName}</div>
            <div class="content-dark-color flex-row-center">
              {account.uuid}
              <Button
                icon={IconCopy}
                size={'small'}
                kind={'ghost'}
                on:click={() => copyTextToClipboard(account.uuid)}
                showTooltip={{ label: adminRes.string.CopyUuid }}
              />
            </div>
          </td>
          <td>{primaryEmail(account)}</td>
          <td>{account.socialIds.length}</td>
          <td>{account.workspaces.length}</td>
          <td>
            <div class="flex-row-center">
              <Button
                icon={IconDetails}
                size={'small'}
                kind={'ghost'}
                label={adminRes.string.Details}
                on:click={() => {
                  showPopup(AccountDetails, { account })
                }}
              />
              {#if accountSuperAdminMode}
                <Button
                  icon={IconStop}
                  size={'small'}
                  kind={'dangerous'}
                  label={adminRes.string.Delete}
                  on:click={() => deleteAccount(account.uuid)}
                />
              {/if}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style lang="scss">
  .accounts-table {
    width: 100%;
    border-collapse: collapse;
    th,
    td {
      text-align: left;
      padding: 0.35rem 1rem 0.35rem 0;
      border-bottom: 1px solid var(--theme-divider-color, #8883);
    }
  }
</style>
