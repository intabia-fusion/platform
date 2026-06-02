<script lang="ts">
  import { RegionInfo, AccountAggregatedInfo, type SubscriptionInfo, Subscription } from '@hcengineering/account-client'
  import {
    AccountUuid,
    groupByArray,
    isActiveMode,
    isArchivingMode,
    isDeletingMode,
    isMigrationMode,
    isRestoringMode,
    isUpgradingMode,
    reduceCalls,
    systemAccountUuid,
    versionToString,
    type WorkspaceInfoWithStatus
  } from '@hcengineering/core'
  import { getEmbeddedLabel, getMetadata } from '@hcengineering/platform'
  import presentation, {
    copyTextToClipboard,
    isAdminUser,
    MessageBox,
    type OverviewStatistics,
    type WorkspaceStatistics
  } from '@hcengineering/presentation'
  import {
    Button,
    ButtonMenu,
    CheckBox,
    Expandable,
    IconArrowRight,
    IconCopy,
    IconDownOutline,
    IconOpen,
    IconStart,
    IconStop,
    locationToUrl,
    Popup,
    Scroller,
    SearchEdit,
    showPopup,
    TabList,
    ticker,
    themeStore,
    type TabItem
  } from '@hcengineering/ui'
  import { workbenchId } from '@hcengineering/workbench'
  import { getAccountClient, getAllWorkspaces, getRegionInfo, performWorkspaceOperation } from '../utils'

  $: now = $ticker

  $: isAdmin = isAdminUser()

  const accountClient = getAccountClient()

  let search: string = ''

  async function select (workspace: string): Promise<void> {
    const url = locationToUrl({ path: [workbenchId, workspace] })
    window.open(url, '_blank')
  }

  type WorkspaceInfo = WorkspaceInfoWithStatus & { processingAttempts: number }

  let workspaces: WorkspaceInfo[] = []

  enum SortingRule {
    Activity = '1',
    Name = '2',
    BackupDate = '3',
    BackupSize = '4',
    LastVisit = '5'
  }

  let sortingRule = SortingRule.Activity

  const sortRules = {
    [SortingRule.Activity]: 'Active users',
    [SortingRule.Name]: 'Name',
    [SortingRule.BackupDate]: 'Backup date',
    [SortingRule.BackupSize]: 'Backup size',
    [SortingRule.LastVisit]: 'Last visit'
  }

  const updateWorkspaces = reduceCalls(async (_: number) => {
    const res = await getAllWorkspaces()
    workspaces = res as WorkspaceInfo[]
  })

  $: void updateWorkspaces($ticker)

  // Individual filters

  let showActive: boolean = true
  let showArchived: boolean = false
  let showDeleted: boolean = false
  let showOther: boolean = true
  let showGrAttempts: boolean = true
  let showSelectedRegionOnly: boolean = false
  let showInactive = false

  function isWorkspaceInactive (it: WorkspaceInfo, stats: WorkspaceStatistics | undefined): boolean {
    if (stats === undefined) {
      return true
    }
    const ops = (stats.sessions ?? []).reduceRight(
      (p, it) => p + (it.mins5.tx + it.mins5.find) + (it.current.tx + it.current.find),
      0
    )
    if (ops === 0) {
      return true
    }
    if (stats.sessions.filter((it) => (it.userId as any) !== systemAccountUuid).length === 0) {
      return true
    }
    return false
  }

  function getBackupSize (workspace: WorkspaceInfo): number {
    return Math.max(
      workspace.backupInfo?.backupSize ?? 0,
      (workspace.backupInfo?.dataSize ?? 0) + (workspace.backupInfo?.blobsSize ?? 0)
    )
  }

  $: sortedWorkspaces = workspaces
    .filter(
      (it) =>
        ((it.name?.includes(search) ?? false) ||
          (it.url?.includes(search) ?? false) ||
          it.uuid?.includes(search) ||
          it.createdBy?.includes(search)) &&
        (showSelectedRegionOnly ? it.region === filterRegionId : true) &&
        (showInactive ? isWorkspaceInactive(it, statsByWorkspace.get(it.uuid)) : true) &&
        ((showActive && isActiveMode(it.mode)) ||
          (showArchived && isArchivingMode(it.mode)) ||
          (showDeleted && isDeletingMode(it.mode)) ||
          (showOther &&
            (isMigrationMode(it.mode) ||
              isRestoringMode(it.mode) ||
              isUpgradingMode(it.mode) ||
              (isArchivingMode(it.mode) && it.mode !== 'archived'))) ||
          (showGrAttempts && it.processingAttempts > 0))
    )
    .sort((a, b) => {
      switch (sortingRule) {
        case SortingRule.Activity: {
          const aStats = statsByWorkspace.get(a.uuid ?? '')
          const bStats = statsByWorkspace.get(b.uuid ?? '')
          return (bStats?.sessions?.length ?? 0) - (aStats?.sessions?.length ?? 0)
        }
        case SortingRule.BackupDate: {
          return (a.backupInfo?.lastBackup ?? 0) - (b.backupInfo?.lastBackup ?? 0)
        }
        case SortingRule.BackupSize:
          return getBackupSize(b) - getBackupSize(a)
        case SortingRule.LastVisit:
          return (b.lastVisit ?? 0) - (a.lastVisit ?? 0)
      }
      return (b.url ?? b.uuid).localeCompare(a.url ?? a.uuid)
    })

  let backupIdx = new Map<string, number>()

  const backupInterval: number = 43200

  let backupable: WorkspaceInfo[] = []

  const token: string = getMetadata(presentation.metadata.Token) ?? ''

  const endpoint = getMetadata(presentation.metadata.StatsUrl)

  async function fetchStats (time: number): Promise<void> {
    await fetch(endpoint + `/api/v1/overview?token=${token}`, {})
      .then(async (json) => {
        data = await json.json()
      })
      .catch((err) => {
        console.error(err)
      })
  }
  let data: OverviewStatistics | undefined
  $: void fetchStats($ticker)

  $: statsByWorkspace = new Map((data?.workspaces ?? []).map((it) => [it.wsId, it]))

  $: {
    // Assign backup idx
    const backupSorting = [...workspaces].filter((it) => {
      if (!isActiveMode(it.mode)) {
        return false
      }
      const lastBackup = it.backupInfo?.lastBackup ?? 0
      if ((now - lastBackup) / 1000 < backupInterval) {
        // No backup required, interval not elapsed
        return false
      }

      const createdOn = Math.floor((now - it.createdOn) / 1000)
      if (createdOn <= 2) {
        // Skip if we created is less 2 days
        return false
      }
      if (it.lastVisit == null) {
        return false
      }

      const lastVisitSec = Math.floor((now - it.lastVisit) / 1000)
      if (lastVisitSec > backupInterval) {
        // No backup required, interval not elapsed
        return false
      }
      return true
    })
    const newBackupIdx = new Map<string, number>()

    backupSorting.sort((a, b) => {
      return (a.backupInfo?.lastBackup ?? 0) - (b.backupInfo?.lastBackup ?? 0)
    })

    // Shift new with existing ones.
    const existingNew = groupByArray(backupSorting, (it) => it.backupInfo != null)

    const existing = existingNew.get(true) ?? []
    const newOnes = existingNew.get(false) ?? []
    const mixedBackupSorting: WorkspaceInfo[] = []

    while (existing.length > 0 || newOnes.length > 0) {
      const e = existing.shift()
      const n = newOnes.shift()
      if (e != null) {
        mixedBackupSorting.push(e)
      }
      if (n != null) {
        mixedBackupSorting.push(n)
      }
    }

    backupable = mixedBackupSorting

    for (const [idx, it] of mixedBackupSorting.entries()) {
      newBackupIdx.set(it.uuid, idx)
    }
    backupIdx = newBackupIdx
  }

  const dayRanges = {
    Hour: [-1, 0.1],
    HalfDay: [0.1, 0.5],
    Day: [0.5, 1],
    Week: [1, 7],
    Weeks: [7, 14],
    Month: [14, 30],
    Months1: [30, 60],
    Months2: [60, 90],
    Months3: [90, 180],
    'Six Month': [180, 270],
    'Nine Months': [270, 365],
    Years: [365, 10000000]
  }

  let limit = 50

  $: groupped = groupByArray(sortedWorkspaces, (it) => {
    const lastUsageDays = Math.round((10 * (now - (it.lastVisit ?? 0))) / (1000 * 3600 * 24)) / 10
    return Object.entries(dayRanges).find(([_k, v]) => v[0] < lastUsageDays && lastUsageDays <= v[1])?.[0] ?? 'Years'
  })

  let regionInfo: RegionInfo[] = []

  let regionTitles: Record<string, string> = {}

  let selectedRegionId: string = ''

  let filterRegionId: string = ''

  void getRegionInfo().then((_regionInfo) => {
    regionInfo = _regionInfo ?? []
    regionTitles = Object.fromEntries(
      regionInfo.map((it) => [it.region, it.name.length !== 0 ? it.name : it.region.length > 0 ? it.region : 'Default'])
    )
    if (selectedRegionId === '' && regionInfo.length > 0) {
      selectedRegionId = regionInfo[0].region
    }
    if (filterRegionId === '' && regionInfo.length > 0) {
      filterRegionId = regionInfo[0].region
    }
  })

  $: selectedRegionRef = regionInfo.find((it) => it.region === selectedRegionId)
  $: selectedRegionName =
    selectedRegionRef !== undefined
      ? selectedRegionRef.name.length > 0
        ? selectedRegionRef.name
        : selectedRegionRef.region
      : ''

  $: filteredRegionRef = regionInfo.find((it) => it.region === filterRegionId)
  $: filteredRegionName =
    filteredRegionRef !== undefined
      ? filteredRegionRef.name.length > 0
        ? filteredRegionRef.name
        : filteredRegionRef.region
      : ''

  $: byVersion = groupByArray(
    workspaces.filter((it) => {
      const lastUsed = Math.round((now - (it.lastVisit ?? 0)) / (1000 * 3600 * 24))
      return isActiveMode(it.mode) && lastUsed < 1
    }),
    (it) => versionToString({ major: it.versionMajor, minor: it.versionMinor, patch: it.versionPatch })
  )

  $: byRegion = groupByArray(
    workspaces.filter((it) => isActiveMode(it.mode)),
    (it) => regionTitles[it.region ?? '']
  )

  let superAdminMode = false
  let accountSuperAdminMode = false

  let accountSearch = ''
  let accountSkip = 0
  const accountLimit = 10
  let accounts: AccountAggregatedInfo[] = []

  const loadAccounts = reduceCalls(async (search?: string, skip?: number, limit?: number): Promise<void> => {
    console.log('Called loadAccounts', search, skip, limit)
    accounts = await accountClient.listAccounts(search, skip, limit)
  })

  void loadAccounts(accountSearch, accountSkip, accountLimit)

  async function deleteAccount (uuid: AccountUuid): Promise<void> {
    await accountClient.deleteAccount(uuid)
  }

  async function accountSearchChanged (ev: CustomEvent<string>): Promise<void> {
    accountSkip = 0
    await loadAccounts(ev.detail, accountSkip, accountLimit)
  }

  let subscriptions: SubscriptionInfo[] = []
  let subscriptionsLoaded = false
  let billingSearch = ''

  $: workspaceNames = Object.fromEntries(workspaces.map((w) => [w.uuid, w.name ?? w.url ?? w.uuid]))

  async function loadSubscriptions (): Promise<void> {
    try {
      subscriptions = await accountClient.getAllSubscriptions()
    } catch (err) {
      console.error('Failed to load subscriptions:', err)
    } finally {
      subscriptionsLoaded = true
    }
  }

  $: if (isAdmin && workspaces.length > 0 && !subscriptionsLoaded) {
    void loadSubscriptions()
  }

  $: filteredSubscriptions =
    billingSearch.length > 0
      ? subscriptions.filter(
        (s) =>
          (workspaceNames[s.workspaceUuid] ?? '').toLowerCase().includes(billingSearch.toLowerCase()) ||
            (planLabels[s.plan] ?? s.plan).toLowerCase().includes(billingSearch.toLowerCase()) ||
            Boolean(s.plan.toLowerCase().includes(billingSearch.toLowerCase())) ||
            Boolean(s.payerName?.toLowerCase().includes(billingSearch.toLowerCase())) ||
            s.payerEmail?.toLowerCase().includes(billingSearch.toLowerCase())
      )
      : subscriptions

  interface WorkspaceGroup {
    workspaceUuid: string
    workspaceName: string
    currentPlan: string
    currentPackage: string
    lastChangedOn: number
    lastChangedBy: string
    entries: SubscriptionInfo[]
  }

  $: workspaceGroups = (() => {
    const byWs = new Map<string, SubscriptionInfo[]>()
    for (const s of filteredSubscriptions) {
      const list = byWs.get(s.workspaceUuid)
      if (list !== undefined) list.push(s)
      else byWs.set(s.workspaceUuid, [s])
    }
    const groups: WorkspaceGroup[] = []
    for (const [uuid, entries] of byWs.entries()) {
      let currentPlan = ''
      let currentPackage = ''
      let lastChangedOn = 0
      let lastChangedBy = ''
      for (const e of entries) {
        if (e.status === 'active') {
          const name = planLabels[e.plan] ?? e.plan
          if (e.type === 'tier') currentPlan = name
          else if (e.type === 'package') currentPackage = name
        }
        if (e.createdOn > lastChangedOn) {
          lastChangedOn = e.createdOn
          lastChangedBy = e.payerName ?? e.payerEmail ?? e.accountUuid.slice(0, 8)
        }
      }
      groups.push({
        workspaceUuid: uuid,
        workspaceName: workspaceNames[uuid] ?? uuid.slice(0, 8),
        currentPlan,
        currentPackage,
        lastChangedOn,
        lastChangedBy,
        entries: [...entries].sort((a, b) => b.createdOn - a.createdOn)
      })
    }
    groups.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName))
    return groups
  })()

  const expandedWorkspaces: Record<string, boolean> = {}

  function formatDate (ts: number): string {
    return new Date(ts).toLocaleDateString()
  }

  function formatDateTime (ts: number): string {
    return new Date(ts).toLocaleString()
  }

  // --- Admin Create Subscription Form ---

  let selectedWorkspaceUuid = ''
  let selectedPlan = ''

  let planKeys: string[] = []
  let planLabels: Record<string, string> = {}
  let planSections: Record<string, string> = {}

  async function loadPlans (): Promise<void> {
    try {
      const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
      const res = await fetch(paymentUrl + '/api/v1/plan-config')
      if (!res.ok) return
      const config = await res.json()
      const allKeys = [...Object.keys(config.plans ?? {}), ...Object.keys(config.packages ?? {})]
      planKeys = allKeys
      const labels: Record<string, string> = {}
      const lang = $themeStore.language ?? 'en'
      const sections: Record<string, string> = {}
      for (const [k, v] of Object.entries(config.plans ?? {})) {
        sections[k] = 'tier'
        const item = v as any
        labels[k] = typeof item.label === 'object' ? (item.label[lang] ?? item.label.en ?? k) : (item.label ?? k)
      }
      for (const [k, v] of Object.entries(config.packages ?? {})) {
        sections[k] = 'package'
        const item = v as any
        const desc =
          typeof item.description === 'object'
            ? (item.description[lang] ?? item.description.en ?? k)
            : (item.description ?? k)
        labels[k] = desc
      }
      planLabels = labels
      planSections = sections
    } catch (err) {
      console.error('Failed to load plans:', err)
    }
  }

  $: if (isAdmin && planKeys.length === 0) {
    void loadPlans()
  }

  $: planItems = planKeys.map((k) => ({ id: k, label: getEmbeddedLabel(`${planLabels[k] ?? k} (${k})`) }))

  $: inferredType = planSections[selectedPlan] ?? 'tier'

  $: existingActive =
    selectedWorkspaceUuid.length > 0 && selectedPlan.length > 0
      ? subscriptions.find(
        (s) => s.workspaceUuid === selectedWorkspaceUuid && s.type === inferredType && s.status === 'active'
      )
      : null

  async function adminCreateSub (): Promise<void> {
    if (selectedWorkspaceUuid.length === 0 || selectedPlan.length === 0) return

    const doCreate = async (): Promise<void> => {
      try {
        let limits: Subscription['limits'] | undefined
        try {
          const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
          const res = await fetch(paymentUrl + '/api/v1/plan-config')
          if (res.ok) {
            const config = await res.json()
            const source = inferredType === 'package' ? config.packages : config.plans
            const item = source?.[selectedPlan]
            if (item != null) {
              limits = {
                storageLimitGB: item.storageLimitGB ?? 0,
                trafficLimitGB: item.trafficLimitGB ?? 0,
                meetingMinutesLimit: item.meetingMinutesLimit ?? 0,
                tokenLimit: item.tokenLimit ?? 0,
                usersLimit: item.usersLimit ?? 0,
                projectsLimit: item.projectsLimit ?? 0
              }
            }
          }
        } catch {
          // plan config unavailable, proceed without limits (fallback to config on read)
        }
        await accountClient.adminCreateSubscription({
          workspaceUuid: selectedWorkspaceUuid as any,
          plan: selectedPlan,
          type: inferredType,
          limits
        })
        selectedWorkspaceUuid = ''
        selectedPlan = ''
        subscriptionsLoaded = false
      } catch (err) {
        console.error('Failed to create subscription:', err)
      }
    }

    if (existingActive != null) {
      const existingLabel = planLabels[existingActive.plan] ?? existingActive.plan
      const newLabel = planLabels[selectedPlan] ?? selectedPlan
      showPopup(MessageBox, {
        label: getEmbeddedLabel('Replace subscription'),
        message: getEmbeddedLabel(`Workspace already has "${existingLabel}". Replace with "${newLabel}"?`),
        action: doCreate
      })
    } else {
      await doCreate()
    }
  }

  $: workspaceSelectItems = workspaces.map((w) => ({
    id: w.uuid,
    label: getEmbeddedLabel(w.name ?? w.url ?? w.uuid)
  }))

  // --- Tabs ---

  let selectedTab: string = 'workspaces'

  const tabItems: TabItem[] = [
    { id: 'workspaces', label: 'Workspaces' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'billing', label: 'Billing' }
  ]

  function onTabSelect (ev: CustomEvent): void {
    if (ev.detail !== undefined) {
      selectedTab = ev.detail.id
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if isAdmin}
  <Scroller>
    <div class="flex-column flex-grow p-5">
      <div class="flex-row-center mb-4">
        <TabList items={tabItems} selected={selectedTab} on:select={onTabSelect} />
      </div>

      {#if selectedTab === 'workspaces'}
        <div class="anticrm-panel flex-row flex-grow" style:overflow-y={'auto'}>
          <div class="flex-between">
            <div class="fs-title p-3">Workspaces administration panel</div>
            <div class="flex-row-center">
              <span class="mr-4">Enable deletion</span>
              <CheckBox bind:checked={superAdminMode} />
            </div>
          </div>
          <div class="fs-title p-3">
            Workspaces: {workspaces.length} active: {workspaces.filter((it) => isActiveMode(it.mode)).length}
            upgrading: {workspaces.filter((it) => isUpgradingMode(it.mode)).length}
            <br />
            Backupable: {backupable.length} new: {backupable.reduce((p, it) => p + (it.backupInfo == null ? 1 : 0), 0)}
            Active: {data?.workspaces.length ?? -1}
            <br />
            <span class="mt-2">
              Users: {data?.usersTotal}/{data?.connectionsTotal}
            </span>

            <div class="flex-row-center">
              {#each byVersion.entries() as [k, v]}
                <div class="p-1">
                  {k}: {v.length}
                </div>
              {/each}
            </div>
            <div class="flex-row-center">
              {#each byRegion.entries() as [k, v]}
                <div class="p-1">
                  {k ?? ''}: {v.length}
                </div>
              {/each}
            </div>
          </div>
          <div class="fs-title p-3 flex-no-shrink" data-testid="workspace-search-container">
            <SearchEdit bind:value={search} width={'100%'} />
          </div>

          <div class="p-3 flex-col">
            <span class="fs-title mr-2">Filters: </span>
            <div class="flex-row-center">
              Show active workspaces:
              <CheckBox bind:checked={showActive} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show archived workspaces:</span>
              <CheckBox bind:checked={showArchived} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show deleted workspaces:</span>
              <CheckBox bind:checked={showDeleted} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show other workspaces:</span>
              <CheckBox bind:checked={showOther} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show attempts >=0 workspaces:</span>
              <CheckBox bind:checked={showGrAttempts} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show selected region only:</span>
              <CheckBox bind:checked={showSelectedRegionOnly} />
            </div>
            <div class="flex-row-center">
              <span class="mr-2">Show inactive workspaces:</span>
              <CheckBox bind:checked={showInactive} />
            </div>
          </div>

          <div class="fs-title p-3 flex-row-center">
            <span class="mr-2"> Sorting order: {sortingRule} </span>
            <ButtonMenu
              selected={sortingRule}
              autoSelectionIfOne
              title={sortRules[sortingRule]}
              items={Object.entries(sortRules).map((it) => ({ id: it[0], label: getEmbeddedLabel(it[1]) }))}
              on:selected={(it) => {
                sortingRule = it.detail
              }}
            />
          </div>

          <div class="fs-title p-3 flex-row-center">
            <span class="mr-2"> Migration region selector: </span>
            <ButtonMenu
              selected={selectedRegionId}
              autoSelectionIfOne
              title={selectedRegionName}
              items={regionInfo.map((it) => ({
                id: it.region === '' ? '#' : it.region,
                label: getEmbeddedLabel(it.name.length > 0 ? it.name : it.region + ' (hidden)')
              }))}
              on:selected={(it) => {
                selectedRegionId = it.detail === '#' ? '' : it.detail
              }}
            />
          </div>

          <div class="fs-title p-3 flex-row-center">
            <div class="mr-2">
              <CheckBox bind:checked={showSelectedRegionOnly} />
            </div>
            <span class="mr-2"> Filtere region selector: </span>
            <ButtonMenu
              selected={filterRegionId}
              autoSelectionIfOne
              title={filteredRegionName}
              items={regionInfo.map((it) => ({
                id: it.region === '' ? '#' : it.region,
                label: getEmbeddedLabel(it.name.length > 0 ? it.name : it.region + ' (hidden)')
              }))}
              on:selected={(it) => {
                filterRegionId = it.detail === '#' ? '' : it.detail
              }}
            />
          </div>
          <div class="fs-title p-1">
            <Scroller maxHeight={40} noStretch={true}>
              <div class="mr-4">
                {#each Object.keys(dayRanges) as k}
                  {@const v = groupped.get(k) ?? []}
                  {@const hasMore = (groupped.get(k) ?? []).length > limit}
                  {@const activeV = v
                    .filter((it) => isActiveMode(it.mode) && it.region !== selectedRegionId)
                    .slice(0, limit)}
                  {@const activeAll = v.filter((it) => isActiveMode(it.mode))}
                  {@const archivedV = v.filter((it) => isArchivingMode(it.mode))}
                  {@const deletedV = v.filter((it) => isDeletingMode(it.mode))}
                  {@const maintenance = v.length - activeAll.length - archivedV.length - deletedV.length}
                  {@const grByRegion = groupByArray(v, (it) => regionTitles[it.region ?? ''])}
                  {#if v.length > 0}
                    <Expandable expandable={true} bordered={true} expanded={search.trim().length > 0}>
                      <svelte:fragment slot="title">
                        <span class="fs-title focused-button flex-row-center">
                          {k} -
                          {#if hasMore}
                            {limit} of {v.length}
                          {:else}
                            {v.length}
                          {/if}
                          {#if maintenance > 0}
                            - maitenance: {maintenance}
                          {/if}
                          {#if grByRegion.size > 1}
                            {#each grByRegion.entries() as [k, v]}
                              <div class="p-1">
                                {k ?? ''}: {v.length}
                              </div>
                            {/each}
                          {/if}
                        </span>
                      </svelte:fragment>
                      <svelte:fragment slot="title-tools">
                        {#if hasMore}
                          <div class="ml-4">
                            <Button
                              label={getEmbeddedLabel('More items')}
                              kind={'link'}
                              on:click={() => {
                                limit += 50
                              }}
                            />
                          </div>
                        {/if}
                      </svelte:fragment>
                      <svelte:fragment slot="tools">
                        {#if activeAll.length > 0}
                          <Button
                            icon={IconStop}
                            label={getEmbeddedLabel(`Mass Archive ${activeAll.length}`)}
                            kind={'ghost'}
                            on:click={() => {
                              showPopup(MessageBox, {
                                label: getEmbeddedLabel(`Mass Archive ${activeAll.length}`),
                                message: getEmbeddedLabel(`Please confirm archive ${activeAll.length} workspaces`),
                                action: async () => {
                                  void performWorkspaceOperation(
                                    activeAll.map((it) => it.uuid),
                                    'archive'
                                  )
                                }
                              })
                            }}
                          />
                        {/if}

                        {#if regionInfo.length > 0 && activeV.length > 0}
                          <Button
                            icon={IconArrowRight}
                            kind={'positive'}
                            label={getEmbeddedLabel(`Mass Migrate ${activeV.length} to ${selectedRegionName ?? ''}`)}
                            on:click={() => {
                              showPopup(MessageBox, {
                                label: getEmbeddedLabel(`Mass Migrate ${activeV.length}`),
                                message: getEmbeddedLabel(`Please confirm migrate ${activeV.length} workspaces`),
                                action: async () => {
                                  await performWorkspaceOperation(
                                    activeV.map((it) => it.uuid),
                                    'migrate-to',
                                    selectedRegionId
                                  )
                                }
                              })
                            }}
                          />
                        {/if}
                      </svelte:fragment>
                      {#each v.slice(0, limit) as workspace}
                        {@const wsName = workspace.name}
                        {@const lastUsageDays = Math.round((now - (workspace.lastVisit ?? 0)) / (1000 * 3600 * 24))}
                        {@const bIdx = backupIdx.get(workspace.uuid)}
                        {@const stats = statsByWorkspace.get(workspace.uuid ?? '')}
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <tr class="flex fs-title cursor-pointer focused-button bordered" id={`${workspace.uuid}`}>
                          <div class="label overflow-label p-1 flex flex-row-center" style:width={'15rem'}>
                            {wsName}
                            {#if stats}
                              -
                              <div class="ml-1">
                                {stats.sessions?.length ?? 0}

                                {(stats.sessions ?? []).reduceRight(
                                  (p, it) => p + (it.mins5.tx + it.mins5.find) + (it.current.tx + it.current.find),
                                  0
                                )}
                              </div>
                            {/if}
                            <div class="ml-1 flex flex-row-center">
                              <Button
                                icon={IconOpen}
                                size={'small'}
                                on:click={() => select(workspace.url)}
                                showTooltip={{ label: getEmbeddedLabel('Open Workspace URL') }}
                              />
                              <Button
                                icon={IconCopy}
                                size={'small'}
                                on:click={() => copyTextToClipboard(workspace.uuid)}
                                showTooltip={{ label: getEmbeddedLabel('Copy UUID') }}
                              />
                            </div>
                          </div>
                          <div class="label overflow-label p-1 flex flex-row-center" style:width={'5rem'}>
                            {workspace.region ?? ''}
                          </div>
                          <div class="label overflow-label p-1 flex flex-row-center" style:width={'5rem'}>
                            {lastUsageDays} days
                          </div>
                          <div class="label overflow-label p-1 flex flex-row-center" style:width={'10rem'}>
                            {workspace.mode ?? '-'}
                          </div>
                          <div class="label overflow-label flex flex-row-center" style:width={'5rem'}>
                            {workspace.processingAttempts}
                            {#if workspace.processingAttempts > 0}
                              <Button
                                on:click={() => {
                                  showPopup(MessageBox, {
                                    label: getEmbeddedLabel(`Reset attempts ${workspace.url}`),
                                    message: getEmbeddedLabel('Please confirm'),
                                    action: async () => {
                                      await performWorkspaceOperation(workspace.uuid, 'reset-attempts')
                                    }
                                  })
                                }}
                                icon={IconDownOutline}
                                size={'small'}
                                kind={'ghost'}
                              />
                            {/if}
                          </div>
                          <div class="flex flex-row-center" style:width={'5rem'}>
                            {#if workspace.processingProgress !== 100 && workspace.processingProgress !== 0}
                              ({workspace.processingProgress}%)
                            {/if}
                          </div>
                          <div class="flex flex-row-center" style:width={'15rem'}>
                            {#if workspace.backupInfo != null}
                              {@const sz = Math.max(
                                workspace.backupInfo.backupSize,
                                workspace.backupInfo.dataSize + workspace.backupInfo.blobsSize
                              )}
                              {@const szGb = Math.round((sz * 100) / 1024) / 100}
                              {#if szGb > 0}
                                {Math.round((sz * 100) / 1024) / 100}Gb
                              {:else}
                                {Math.round(sz * 100) / 100}Mb
                              {/if}
                            {/if}
                            {#if bIdx != null}
                              [#{bIdx}]
                            {/if}
                          </div>
                          <div class="flex flex-row-center" style:width={'15rem'}>
                            {#if workspace.backupInfo != null}
                              {@const hours = Math.round((now - workspace.backupInfo.lastBackup) / (1000 * 3600))}

                              {#if hours > 24}
                                {Math.round(hours / 24)} days
                              {:else}
                                {hours} hours
                              {/if}
                            {/if}
                          </div>
                          <div class="flex flex-row-center p-1">
                            {#if workspace.mode === 'active'}
                              <Button
                                icon={IconStop}
                                size={'small'}
                                label={getEmbeddedLabel('Archive')}
                                kind={'ghost'}
                                on:click={() => {
                                  showPopup(MessageBox, {
                                    label: getEmbeddedLabel(`Archive ${workspace.url}`),
                                    message: getEmbeddedLabel('Please confirm'),
                                    action: async () => {
                                      await performWorkspaceOperation(workspace.uuid, 'archive')
                                    }
                                  })
                                }}
                              />
                            {/if}

                            {#if workspace.mode === 'archived'}
                              <Button
                                icon={IconStart}
                                size={'small'}
                                kind={'ghost'}
                                label={getEmbeddedLabel('Unarchive')}
                                on:click={() => {
                                  showPopup(MessageBox, {
                                    label: getEmbeddedLabel(`Unarchive ${workspace.url}`),
                                    message: getEmbeddedLabel('Please confirm'),
                                    action: async () => {
                                      await performWorkspaceOperation(workspace.uuid, 'unarchive')
                                    }
                                  })
                                }}
                              />
                            {/if}
                            {#if regionInfo.length > 0 && workspace.mode === 'active' && (workspace.region ?? '') !== selectedRegionId}
                              <Button
                                icon={IconArrowRight}
                                size={'small'}
                                kind={'positive'}
                                label={getEmbeddedLabel('Migrate')}
                                on:click={() => {
                                  showPopup(MessageBox, {
                                    label: getEmbeddedLabel(`Migrate ${workspace.url}`),
                                    message: getEmbeddedLabel('Please confirm'),
                                    action: async () => {
                                      await performWorkspaceOperation(workspace.uuid, 'migrate-to', selectedRegionId)
                                    }
                                  })
                                }}
                              />
                            {/if}

                            {#if superAdminMode && !isDeletingMode(workspace.mode) && !isArchivingMode(workspace.mode)}
                              <Button
                                icon={IconStop}
                                size={'small'}
                                kind={'dangerous'}
                                label={getEmbeddedLabel('Delete')}
                                on:click={() => {
                                  showPopup(MessageBox, {
                                    label: getEmbeddedLabel(`Delete ${workspace.url}`),
                                    message: getEmbeddedLabel('Please confirm'),
                                    action: async () => {
                                      await performWorkspaceOperation(workspace.uuid, 'delete')
                                    }
                                  })
                                }}
                              />
                            {/if}
                          </div>
                        </tr>
                      {/each}
                    </Expandable>
                  {/if}
                {/each}
              </div>
            </Scroller>
          </div>
        </div>
      {/if}

      {#if selectedTab === 'accounts'}
        <div class="flex-between">
          <div class="fs-title p-3">Accounts administration panel</div>
          <div class="flex-row-center">
            <span class="mr-4">Enable deletion</span>
            <CheckBox bind:checked={accountSuperAdminMode} />
          </div>
        </div>
        <div class="fs-title p-3 flex-no-shrink">
          <SearchEdit bind:value={accountSearch} width={'100%'} on:change={accountSearchChanged} />
        </div>

        <div class="flex-row-center p-3">
          <Button
            label={getEmbeddedLabel('Previous')}
            disabled={accountSkip === 0}
            on:click={async () => {
              accountSkip = Math.max(0, accountSkip - accountLimit)
              await loadAccounts(accountSearch, accountSkip, accountLimit)
            }}
          />
          <span class="mx-2">Page {Math.floor(accountSkip / accountLimit) + 1}</span>
          <Button
            label={getEmbeddedLabel('Next')}
            disabled={accounts.length < accountLimit}
            on:click={async () => {
              accountSkip += accountLimit
              await loadAccounts(accountSearch, accountSkip, accountLimit)
            }}
          />
        </div>

        <div class="fs-title p-1 select-text-i">
          <Scroller maxHeight={40} noStretch={true}>
            <div class="mr-4">
              {#each accounts as account}
                <tr class="flex focused-button bordered min-h-8">
                  <div class="p-1 flex flex-col w-60">
                    <div class="label overflow-label flex flex-row-center">
                      {account.firstName}
                      {account.lastName}
                    </div>
                    <div>{account.uuid}</div>
                  </div>

                  <div class="p-1 flex flex-col" style:width={'24rem'}>
                    <div class="label">Social IDs: {account.socialIds.length}</div>
                    {#each account.socialIds as socialId}
                      <div class="mr-2">{socialId.type}:{socialId.value}</div>
                    {/each}
                  </div>
                  <div class="p-1 flex flex-col">
                    <div class="label">Workspaces: {account.workspaces.length}</div>
                    {#each account.workspaces as workspace}
                      <div>{workspace.name} {workspace.url} {workspace.uuid} {workspace.dataId}</div>
                    {/each}
                  </div>
                  <div class="flex flex-row-center p-1">
                    {#if accountSuperAdminMode}
                      <Button
                        icon={IconStop}
                        size={'small'}
                        kind={'dangerous'}
                        label={getEmbeddedLabel('Delete')}
                        on:click={() => {
                          showPopup(MessageBox, {
                            label: getEmbeddedLabel(`Delete account ${account.firstName} ${account.lastName}`),
                            message: getEmbeddedLabel('Please confirm account deletion. This action cannot be undone.'),
                            action: async () => {
                              await deleteAccount(account.uuid)
                              await loadAccounts(accountSearch, accountSkip, accountLimit)
                            }
                          })
                        }}
                      />
                    {/if}
                  </div>
                </tr>
              {/each}
            </div>
          </Scroller>
        </div>
      {/if}

      {#if selectedTab === 'billing'}
        <div class="flex-between">
          <div class="fs-title p-3">Billing administration panel</div>
        </div>
        <div class="fs-title p-3 flex-no-shrink">
          <SearchEdit bind:value={billingSearch} width={'100%'} />
        </div>
        {#if subscriptions.length > 0}
          <div class="fs-title p-1 select-text-i">
            {#each workspaceGroups as group}
              <Expandable expandable={true} bordered={true} bind:expanded={expandedWorkspaces[group.workspaceUuid]}>
                <svelte:fragment slot="title">
                  <div class="flex-row-center">
                    <span class="fs-title">{group.workspaceName}</span>
                    <span class="ml-4 fs-normal">
                      {group.currentPlan}{group.currentPackage.length > 0 ? ` + ${group.currentPackage}` : ''}
                    </span>
                  </div>
                </svelte:fragment>
                <svelte:fragment slot="title-tools">
                  <span class="ml-4 fs-normal">
                    Last changed: {formatDate(group.lastChangedOn)} by {group.lastChangedBy}
                  </span>
                </svelte:fragment>
                <table class="mr-4" style="width:100%; border-collapse: collapse;">
                  <thead>
                    <tr style="font-weight: 600;">
                      <td class="p-1" style="width: 8rem;">Date</td>
                      <td class="p-1" style="width: 10rem;">Plan</td>
                      <td class="p-1" style="width: 7rem;">Amount</td>
                      <td class="p-1" style="width: 8rem;">Status</td>
                      <td class="p-1" style="width: 14rem;">By</td>
                    </tr>
                  </thead>
                  <tbody>
                    {#each group.entries as sub}
                      <tr class="focused-button bordered min-h-8">
                        <td
                          class="p-1"
                          style="width: 8rem;"
                          title={sub.createdOn != null ? formatDateTime(sub.createdOn) : ''}
                        >
                          {sub.createdOn != null ? formatDate(sub.createdOn) : ''}
                        </td>
                        <td class="p-1" style="width: 10rem;">{planLabels[sub.plan] ?? sub.plan}</td>
                        <td class="p-1" style="width: 7rem;">{sub.amount != null ? `${sub.amount / 100} ₽` : ''}</td>
                        <td class="p-1" style="width: 8rem;"
                          >{sub.status}{sub.providerData?.pendingReplacement === true ? ' (replacing)' : ''}</td
                        >
                        <td class="p-1" style="width: 14rem;">
                          {sub.payerName ?? sub.payerEmail ?? sub.accountUuid.slice(0, 8)}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </Expandable>
            {/each}
          </div>
        {:else if subscriptionsLoaded}
          <div class="fs-title p-3">No subscriptions found</div>
        {:else}
          <div class="fs-title p-3">Loading subscriptions...</div>
        {/if}

        <div class="flex-between">
          <div class="fs-title p-3 mt-6">Create subscription:</div>
        </div>
        <div class="p-3 flex-row-center">
          <span class="mr-2 fs-title">Workspace:</span>
          <ButtonMenu
            selected={selectedWorkspaceUuid}
            autoSelectionIfOne={false}
            title={workspaceNames[selectedWorkspaceUuid] ?? 'Select workspace'}
            items={workspaceSelectItems}
            on:selected={(it) => {
              selectedWorkspaceUuid = it.detail
            }}
          />
          <span class="mx-2 fs-title">Plan:</span>
          <ButtonMenu
            selected={selectedPlan}
            autoSelectionIfOne={false}
            title={selectedPlan.length > 0 ? (planLabels[selectedPlan] ?? selectedPlan) : 'Select plan'}
            items={planItems}
            on:selected={(it) => {
              selectedPlan = it.detail
            }}
          />
          <div class="ml-4">
            <Button
              label={getEmbeddedLabel('Create')}
              kind={'primary'}
              disabled={selectedWorkspaceUuid.length === 0 || selectedPlan.length === 0}
              on:click={adminCreateSub}
            />
          </div>
        </div>
      {/if}
    </div>
  </Scroller>
  <Popup />
{/if}
