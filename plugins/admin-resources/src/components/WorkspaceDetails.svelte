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
  import type {
    AccountAggregatedInfo,
    Subscription,
    WorkspaceActivityPoint,
    WorkspaceMemberDetails
  } from '@hcengineering/account-client'
  import { AccountRole } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { copyTextToClipboard, MessageBox } from '@hcengineering/presentation'
  import {
    Button,
    ButtonMenu,
    Dialog,
    EditBox,
    IconCopy,
    IconStop,
    Label,
    Loading,
    showPopup,
    themeStore
  } from '@hcengineering/ui'

  import { onDestroy } from 'svelte'

  import adminRes from '../plugin'
  import AdminOtpDialog from './AdminOtpDialog.svelte'
  import EditSubscriptionDialog from './EditSubscriptionDialog.svelte'
  import {
    getAccountClient,
    getWorkspaceActivityStats,
    loadPlanOptions,
    type PlanOptions,
    type WorkspaceInfo
  } from '../utils'

  export let workspace: WorkspaceInfo

  onDestroy(() => {
    clearTimeout(searchTimer)
  })

  const accountClient = getAccountClient()

  // Destructive member operations require an emailed OTP code
  function withOtp (action: (otpCode: string) => Promise<void>): void {
    showPopup(AdminOtpDialog, {}, undefined, (code) => {
      if (typeof code === 'string' && code.length > 0) {
        void action(code)
          .then(() => {
            void load()
          })
          .catch((err) => {
            console.error('Admin operation failed:', err)
          })
      }
    })
  }

  const memberRoles = [AccountRole.Guest, AccountRole.User, AccountRole.Maintainer, AccountRole.Owner]
  const roleItems = memberRoles.map((r) => ({ id: r, label: getEmbeddedLabel(r) }))

  let newMemberRole: AccountRole = AccountRole.User

  // Add member: search among registered accounts, pick one (not free-text email)
  let memberSearch = ''
  let memberResults: AccountAggregatedInfo[] = []
  let selectedNewMember: AccountAggregatedInfo | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  function memberEmail (a: AccountAggregatedInfo): string {
    return a.socialIds.find((s) => s.type === 'email')?.value ?? a.socialIds[0]?.value ?? ''
  }

  function onMemberSearch (): void {
    selectedNewMember = undefined
    clearTimeout(searchTimer)
    const q = memberSearch.trim()
    if (q.length < 2) {
      memberResults = []
      return
    }
    searchTimer = setTimeout(() => {
      void accountClient
        .listAccounts(q, 0, 10)
        .then((res) => {
          memberResults = res
        })
        .catch((err) => {
          console.error('Account search failed:', err)
          memberResults = []
        })
    }, 300)
  }

  function addSelectedMember (): void {
    const target = selectedNewMember
    if (target === undefined) return
    const email = memberEmail(target)
    if (email === '') return
    const role = newMemberRole
    withOtp(async (code) => {
      await accountClient.adminAddWorkspaceMember(workspace.uuid, email, role, code)
      memberSearch = ''
      memberResults = []
      selectedNewMember = undefined
    })
  }

  function reindex (): void {
    showPopup(MessageBox, {
      label: adminRes.string.Reindex,
      message: adminRes.string.PleaseConfirm,
      action: async () => {
        await accountClient.adminReindexWorkspace(workspace.uuid)
      }
    })
  }

  function editSubscription (s: Subscription): void {
    showPopup(EditSubscriptionDialog, { subscription: s, perSeatPlan: isPerSeatPlan(s.plan) }, undefined, (changed) => {
      if (changed === true) void load()
    })
  }

  function cancelSubscription (s: Subscription): void {
    withOtp(async (code) => {
      await accountClient.adminCancelSubscription(s.id, code)
    })
  }

  function isPerSeatPlan (plan: string): boolean {
    const item = plans?.config?.plans?.[plan] ?? plans?.config?.packages?.[plan]
    return item?.priceMonthlyPerUser != null
  }

  // Workspace name/url editing
  let editingName = false
  let nameValue = ''
  let editingUrl = false
  let urlValue = ''

  function startEditName (): void {
    nameValue = workspace.name ?? ''
    editingName = true
  }
  function startEditUrl (): void {
    urlValue = workspace.url ?? ''
    editingUrl = true
  }
  async function saveName (): Promise<void> {
    const name = nameValue.trim()
    if (name.length === 0 || name === workspace.name) {
      editingName = false
      return
    }
    try {
      await accountClient.adminUpdateWorkspaceName(workspace.uuid, name)
      workspace = { ...workspace, name }
    } catch (err) {
      console.error('Failed to rename workspace:', err)
    } finally {
      editingName = false
    }
  }
  function saveUrl (): void {
    const url = urlValue.trim().toLowerCase()
    if (url.length === 0 || url === workspace.url) {
      editingUrl = false
      return
    }
    // URL change breaks bookmarks/redirects -> OTP-gated on the server
    withOtp(async (code) => {
      await accountClient.adminUpdateWorkspaceUrl(workspace.uuid, url, code)
      workspace = { ...workspace, url }
    })
    editingUrl = false
  }

  let subscriptions: Subscription[] = []
  let activity: WorkspaceActivityPoint[] = []
  let members: WorkspaceMemberDetails[] = []
  let plans: PlanOptions | null = null
  let loading = true

  const ACTIVITY_WEEKS = 12

  async function load (): Promise<void> {
    loading = true
    try {
      const from = Date.now() - ACTIVITY_WEEKS * 7 * 24 * 3600 * 1000
      ;[subscriptions, activity, members, plans] = await Promise.all([
        accountClient.getSubscriptions(workspace.uuid, false).catch(() => []),
        getWorkspaceActivityStats(workspace.uuid, from),
        accountClient.getWorkspaceMembersInfo(workspace.uuid).catch(() => []),
        loadPlanOptions($themeStore.language ?? 'en')
      ])
    } finally {
      loading = false
    }
  }

  void load()

  function fmtBytes (bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${Math.round((bytes * 100) / 1024 / 1024 / 1024) / 100} GB`
    if (bytes >= 1024 * 1024) return `${Math.round((bytes * 100) / 1024 / 1024) / 100} MB`
    return `${Math.round(bytes / 1024)} KB`
  }

  function fmtDate (ts: number | undefined): string {
    return ts != null && ts > 0 ? new Date(ts).toLocaleString() : '-'
  }

  $: usage = workspace.usageInfo?.usage ?? {}
  $: maxActivity = Math.max(1, ...activity.map((p) => p.count))

  // --- create subscription (for this workspace) ---
  let selectedPlan = ''
  let seats: number = 1
  let periodDays: number = 30
  let isCreating = false

  $: planItems = (plans?.keys ?? []).map((k) => ({
    id: k,
    label: getEmbeddedLabel(`${plans?.labels[k] ?? k} (${k})`)
  }))
  $: inferredType = plans?.sections[selectedPlan] ?? 'tier'
  $: planItem =
    plans == null || selectedPlan === ''
      ? undefined
      : (inferredType === 'package' ? plans.config.packages : plans.config.plans)?.[selectedPlan]
  $: perSeat = planItem?.priceMonthlyPerUser != null
  // EditBox can leave the bound value undefined while the field is cleared
  $: if (perSeat && (seats == null || seats < 1)) seats = 1
  $: existingActive = subscriptions.find((s) => s.type === inferredType && s.status === 'active')

  async function adminCreateSub (): Promise<void> {
    if (selectedPlan.length === 0 || isCreating || plans == null) return
    isCreating = true

    const doCreate = async (): Promise<void> => {
      try {
        const item = planItem
        let limits: any
        if (item != null) {
          const usersLimit = perSeat ? (seats != null && seats >= 1 ? seats : 1) : (item.usersLimit ?? 0)
          const storageLimitGB =
            item.storagePerUserGB != null ? usersLimit * item.storagePerUserGB : (item.storageLimitGB ?? 0)
          limits = {
            storageLimitGB,
            trafficLimitGB: item.trafficLimitGB ?? 0,
            meetingMinutesLimit: item.meetingMinutesLimit ?? 0,
            tokenLimit: item.tokenLimit ?? 0,
            usersLimit
          }
        }
        await accountClient.adminCreateSubscription({
          workspaceUuid: workspace.uuid as any,
          plan: selectedPlan,
          type: inferredType as any,
          limits,
          periodDays: periodDays > 0 ? periodDays : 30
        })
        selectedPlan = ''
        void load()
      } catch (err) {
        console.error('Failed to create subscription:', err)
      } finally {
        isCreating = false
      }
    }

    if (existingActive != null) {
      const existingLabel = plans.labels[existingActive.plan] ?? existingActive.plan
      const newLabel = plans.labels[selectedPlan] ?? selectedPlan
      showPopup(
        MessageBox,
        {
          label: adminRes.string.ReplaceSubscription,
          message: getEmbeddedLabel(`Workspace already has "${existingLabel}". Replace with "${newLabel}"?`),
          action: doCreate
        },
        undefined,
        (confirmed) => {
          if (confirmed !== true) isCreating = false
        }
      )
    } else {
      await doCreate()
    }
  }
</script>

<Dialog label={getEmbeddedLabel(workspace.name ?? workspace.url ?? workspace.uuid)} on:close>
  {#if loading}
    <Loading />
  {:else}
    <div class="flex-row-top flex-wrap">
      <div class="mr-8 mb-2">
        <div class="fs-title mb-1"><Label label={adminRes.string.Usage} /></div>
        <div><Label label={adminRes.string.Disk} />: {fmtBytes(usage.storageBytes ?? 0)}</div>
        <div><Label label={adminRes.string.Members} />: {usage.membersCount ?? 0}</div>
        <div><Label label={adminRes.string.AITokens} />: {usage.tokens ?? 0}</div>
        <div><Label label={adminRes.string.MeetingMinutes} />: {usage.meetingMinutes ?? 0}</div>
        <div class="content-dark-color">
          <Label label={adminRes.string.UpdatedAt} />: {fmtDate(workspace.usageInfo?.updateTime)}
        </div>
      </div>

      <div class="mr-8 mb-2">
        <div class="fs-title mb-1"><Label label={adminRes.string.Backup} /></div>
        {#if workspace.backupInfo != null}
          <div><Label label={adminRes.string.Data} />: {Math.round(workspace.backupInfo.dataSize * 100) / 100} MB</div>
          <div>
            <Label label={adminRes.string.Blobs} />: {Math.round(workspace.backupInfo.blobsSize * 100) / 100} MB
          </div>
          <div>
            <Label label={adminRes.string.Backup} />: {Math.round(workspace.backupInfo.backupSize * 100) / 100} MB
          </div>
          <div><Label label={adminRes.string.Backups} />: {workspace.backupInfo.backups}</div>
          <div class="content-dark-color">
            <Label label={adminRes.string.LastBackup} />: {fmtDate(workspace.backupInfo.lastBackup)}
          </div>
        {:else}
          <div>-</div>
        {/if}
      </div>

      <div class="mr-8 mb-2">
        <div class="fs-title mb-1"><Label label={adminRes.string.Info} /></div>
        <div class="flex-row-center">
          <Label label={adminRes.string.Uuid} />: {workspace.uuid}
          <Button
            icon={IconCopy}
            size={'small'}
            kind={'ghost'}
            on:click={() => copyTextToClipboard(workspace.uuid)}
            showTooltip={{ label: adminRes.string.CopyUuid }}
          />
        </div>
        <div class="flex-row-center">
          <Label label={adminRes.string.Name} />:
          {#if editingName}
            <div class="ml-1 edit-inline"><EditBox bind:value={nameValue} kind={'editbox'} autoFocus /></div>
            <Button size={'small'} kind={'ghost'} label={adminRes.string.Save} on:click={saveName} />
          {:else}
            <span class="ml-1">{workspace.name}</span>
            <Button size={'small'} kind={'ghost'} label={adminRes.string.Edit} on:click={startEditName} />
          {/if}
        </div>
        <div class="flex-row-center">
          <Label label={adminRes.string.Url} />:
          {#if editingUrl}
            <div class="ml-1 edit-inline"><EditBox bind:value={urlValue} kind={'editbox'} autoFocus /></div>
            <Button size={'small'} kind={'ghost'} label={adminRes.string.Save} on:click={saveUrl} />
          {:else}
            <span class="ml-1">{workspace.url}</span>
            <Button size={'small'} kind={'ghost'} label={adminRes.string.Edit} on:click={startEditUrl} />
          {/if}
        </div>
        <div>
          <Label label={adminRes.string.Region} />: {workspace.region === '' || workspace.region == null
            ? 'Default'
            : workspace.region}
        </div>
        <div><Label label={adminRes.string.Mode} />: {workspace.mode}</div>
        <div><Label label={adminRes.string.CreatedOn} />: {fmtDate(workspace.createdOn)}</div>
        <div><Label label={adminRes.string.LastVisit} />: {fmtDate(workspace.lastVisit)}</div>
        <div class="mt-2">
          <Button label={adminRes.string.Reindex} size={'small'} on:click={reindex} />
        </div>
      </div>
    </div>

    <div class="fs-title mt-3 mb-1"><Label label={adminRes.string.Members} /> ({members.length})</div>
    {#if members.length > 0}
      <div class="scroll-list">
        <table class="subs-table">
          <thead>
            <tr>
              <th><Label label={adminRes.string.Accounts} /></th>
              <th><Label label={adminRes.string.Email} /></th>
              <th><Label label={adminRes.string.Role} /></th>
              <th><Label label={adminRes.string.LastActivity} /></th>
              <th><Label label={adminRes.string.Tx} /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each members as m}
              <tr>
                <td>{m.firstName ?? ''} {m.lastName ?? ''}</td>
                <td>{m.email ?? '-'}</td>
                <td>
                  <ButtonMenu
                    selected={m.role}
                    size={'small'}
                    label={getEmbeddedLabel(m.role)}
                    items={roleItems}
                    on:selected={(it) => {
                      const role = it.detail
                      if (role !== m.role) {
                        withOtp(async (code) => {
                          await accountClient.adminUpdateWorkspaceRole(workspace.uuid, m.account, role, code)
                        })
                      }
                    }}
                  />
                </td>
                <td>{fmtDate(m.lastActivity)}</td>
                <td>{m.txTotal}</td>
                <td>
                  <Button
                    icon={IconStop}
                    size={'small'}
                    kind={'dangerous'}
                    showTooltip={{ label: adminRes.string.RemoveMember }}
                    on:click={() => {
                      withOtp(async (code) => {
                        await accountClient.adminRemoveWorkspaceMember(workspace.uuid, m.account, code)
                      })
                    }}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    <div class="flex-row-center mt-2 flex-wrap">
      <span class="mr-2"><Label label={adminRes.string.AddMember} />:</span>
      <div class="email-input">
        <EditBox
          bind:value={memberSearch}
          placeholder={adminRes.string.SearchAccounts}
          kind={'editbox'}
          on:input={onMemberSearch}
        />
        {#if memberResults.length > 0 && selectedNewMember === undefined}
          <div class="member-results">
            {#each memberResults as a}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div
                class="member-option"
                on:click={() => {
                  selectedNewMember = a
                  memberSearch = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || memberEmail(a)
                }}
              >
                {a.firstName ?? ''}
                {a.lastName ?? ''} <span class="content-dark-color">{memberEmail(a)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="ml-2">
        <ButtonMenu
          selected={newMemberRole}
          size={'small'}
          label={getEmbeddedLabel(newMemberRole)}
          items={roleItems}
          on:selected={(it) => {
            newMemberRole = it.detail
          }}
        />
      </div>
      <div class="ml-2">
        <Button
          label={adminRes.string.Add}
          kind={'primary'}
          disabled={selectedNewMember === undefined}
          on:click={addSelectedMember}
        />
      </div>
    </div>

    <div class="fs-title mt-3 mb-1"><Label label={adminRes.string.WeeklyActivity} /></div>
    {#if activity.length === 0}
      <div class="content-dark-color"><Label label={adminRes.string.NoActivity} /></div>
    {:else}
      <div class="activity">
        {#each activity as p}
          <div class="bar-slot" title={`${p.week}: ${p.count} tx`}>
            <div class="bar" style:height={`${Math.max(2, (p.count / maxActivity) * 48)}px`}></div>
            <div class="bar-label">{p.week.slice(5)}</div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="fs-title mt-3 mb-1"><Label label={adminRes.string.Subscriptions} /></div>
    {#if subscriptions.length === 0}
      <div class="content-dark-color"><Label label={adminRes.string.NoSubscriptions} /></div>
    {:else}
      <div class="scroll-list">
        <table class="subs-table">
          <thead>
            <tr>
              <th><Label label={adminRes.string.Plan} /></th>
              <th><Label label={adminRes.string.Type} /></th>
              <th><Label label={adminRes.string.Status} /></th>
              <th><Label label={adminRes.string.Provider} /></th>
              <th><Label label={adminRes.string.Users} /></th>
              <th><Label label={adminRes.string.CreatedOn} /></th>
              <th><Label label={adminRes.string.PeriodEnd} /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each [...subscriptions].sort((a, b) => b.createdOn - a.createdOn) as s}
              <tr>
                <td>{plans?.labels[s.plan] ?? s.plan}</td>
                <td>{s.type}</td>
                <td>{s.status}</td>
                <td>{s.provider}</td>
                <td>{s.limits?.usersLimit ?? '-'}</td>
                <td>{fmtDate(s.createdOn)}</td>
                <td>{fmtDate(s.periodEnd)}</td>
                <td>
                  {#if s.status !== 'canceled'}
                    <div class="flex-row-center">
                      <Button
                        size={'small'}
                        kind={'ghost'}
                        label={adminRes.string.Edit}
                        on:click={() => {
                          editSubscription(s)
                        }}
                      />
                      <Button
                        size={'small'}
                        kind={'dangerous'}
                        label={adminRes.string.CancelSubscription}
                        on:click={() => {
                          cancelSubscription(s)
                        }}
                      />
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <div class="flex-row-center mt-3 flex-wrap">
      <span class="mr-2"><Label label={adminRes.string.CreateSubscription} />:</span>
      <ButtonMenu
        selected={selectedPlan}
        title={selectedPlan === '' ? '...' : (plans?.labels[selectedPlan] ?? selectedPlan)}
        items={planItems}
        on:selected={(it) => {
          selectedPlan = it.detail
        }}
      />
      {#if perSeat}
        <span class="ml-3 mr-1"><Label label={adminRes.string.Seats} />:</span>
        <div class="seats-input">
          <EditBox bind:value={seats} format={'number'} kind={'editbox'} />
        </div>
      {/if}
      <span class="ml-3 mr-1"><Label label={adminRes.string.PeriodDays} />:</span>
      <div class="seats-input">
        <EditBox bind:value={periodDays} format={'number'} kind={'editbox'} />
      </div>
      <div class="ml-2">
        <Button
          label={adminRes.string.Create}
          kind={'primary'}
          disabled={selectedPlan.length === 0 || isCreating}
          on:click={adminCreateSub}
        />
      </div>
    </div>
  {/if}
</Dialog>

<style lang="scss">
  .activity {
    display: flex;
    align-items: flex-end;
    gap: 4px;
  }
  .bar-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bar {
    width: 14px;
    background: var(--primary-button-default, #3b82f6);
    border-radius: 2px 2px 0 0;
  }
  .bar-label {
    font-size: 0.65rem;
    color: var(--theme-dark-color, #888);
    margin-top: 2px;
  }
  .subs-table {
    border-collapse: collapse;
    th,
    td {
      text-align: left;
      padding: 0.15rem 1rem 0.15rem 0;
      border-bottom: 1px solid var(--theme-divider-color, #8883);
    }
  }
  .seats-input {
    width: 4rem;
  }
  .email-input {
    width: 16rem;
    position: relative;
  }
  .edit-inline {
    width: 14rem;
  }
  .scroll-list {
    max-height: 14rem;
    overflow-y: auto;
  }
  .member-results {
    position: absolute;
    z-index: 10;
    left: 0;
    right: 0;
    max-height: 12rem;
    overflow-y: auto;
    background: var(--theme-popup-color, var(--theme-bg-color));
    border: 1px solid var(--theme-divider-color, #8883);
    border-radius: 0.25rem;
  }
  .member-option {
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    &:hover {
      background: var(--theme-bg-accent-color, #8881);
    }
  }
</style>
