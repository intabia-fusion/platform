<script lang="ts">
  import core, { getCurrentAccount, AccountRole, type Ref } from '@hcengineering/core'
  import type { Application } from '@hcengineering/workbench'
  import workbench from '@hcengineering/workbench'
  import { createQuery } from '@hcengineering/presentation'
  import { getMetadata } from '@hcengineering/platform'
  import { Header, Breadcrumb, Label, Icon, Loading, Toggle, deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import setting from '../plugin'
  import {
    getDefaultHiddenApps,
    hideApplication,
    isAllowedToRole,
    showApplication
  } from '@hcengineering/workbench-resources'

  let loaded = false
  let storedHiddenIds: Array<Ref<Application>> = []
  let hiddenAppsIds: Array<Ref<Application>> = []

  const hiddenAppsIdsQuery = createQuery()
  hiddenAppsIdsQuery.query(workbench.class.HiddenApplication, { space: core.space.Workspace }, (res) => {
    storedHiddenIds = res.map((r) => r.attachedTo)
    loaded = true
  })

  let apps: Application[] = []
  const appsQuery = createQuery()
  appsQuery.query(workbench.class.Application, { hidden: false }, (res) => {
    apps = res
  })

  const me = getCurrentAccount()

  $: defaultHidden = getDefaultHiddenApps($deviceInfo.appsMini)
  $: hiddenAppsIds = [...storedHiddenIds, ...apps.filter((it) => defaultHidden.includes(it.alias)).map((it) => it._id)]

  $: filteredApps = apps.filter(
    (it) => isAllowedToRole(it.accessLevel, me) && it.position !== 'top' && !isExcludedApp(it.alias)
  )

  function isExcludedApp (alias: string): boolean {
    if (me.role === AccountRole.ReadOnlyGuest || me.role === AccountRole.Guest) {
      return (getMetadata(workbench.metadata.ExcludedApplicationsForAnonymous) ?? []).includes(alias)
    }
    return false
  }

  async function toggleApp (app: Application, value: boolean): Promise<void> {
    if (value) {
      await showApplication(app)
    } else {
      await hideApplication(app)
    }
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={setting.icon.Setting} label={setting.string.SidebarMenuSettings} size={'large'} isCurrent />
  </Header>

  <div class="flex-row-stretch flex-grow p-10">
    <div class="flex-grow flex-col flex-gap-4">
      {#if loaded}
        {#each filteredApps as app}
          <div class="flex-row-center flex-gap-4">
            <div class="w-6 h-6 flex-center flex-shrink-0">
              <Icon icon={app.icon} size={'small'} />
            </div>
            <Label label={app.label} />
            <Toggle
              on={!hiddenAppsIds.includes(app._id)}
              on:change={(e) => {
                void toggleApp(app, e.detail)
              }}
            />
          </div>
        {/each}
      {:else}
        <div class="flex-center p-4">
          <Loading />
        </div>
      {/if}
    </div>
  </div>
</div>
