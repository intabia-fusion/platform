<!--
// Copyright © 2020 Anticrm Platform Contributors.
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
  import { createEventDispatcher } from 'svelte'
  import core, { AccountRole, getCurrentAccount, type Ref } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import {
    Scroller,
    deviceOptionsStore as deviceInfo,
    ModernButton,
    showPopup,
    getCurrentLocation,
    navigate
  } from '@hcengineering/ui'
  import { NavLink } from '@hcengineering/view-resources'
  import type { Application } from '@hcengineering/workbench'
  import workbench from '@hcengineering/workbench'
  import { getMetadata, getResource } from '@hcengineering/platform'
  import { InboxNotificationsClientImpl, appearancePreferences } from '@hcengineering/notification-resources'
  import notification, {
    DocNotifyContext,
    InboxNotification,
    NotificationAppearancePreference,
    notificationId
  } from '@hcengineering/notification'

  import AppItem from './AppItem.svelte'
  import AppsMenuPopup from './AppsMenuPopup.svelte'

  export let active: Ref<Application> | undefined
  export let apps: Application[] = []
  export let direction: 'vertical' | 'horizontal' = 'vertical'
  export let customAppProps: Map<string, any> = new Map<string, any>()
  // Mobile: a strip of tiny icons is unhittable - collapse it into one button with a menu.
  export let compact: boolean = false

  const dispatch = createEventDispatcher()

  function getClickHandler (app: Application, customProps: any) {
    return (
      customProps.onClick ??
      (() => {
        if (app._id === active) dispatch('toggleNav')
      })
    )
  }

  let loaded: boolean = false
  let hiddenAppsIds: Array<Ref<Application>> = []
  let excludedApps: string[] = []

  const hiddenAppsIdsQuery = createQuery()
  hiddenAppsIdsQuery.query(
    workbench.class.HiddenApplication,
    {
      space: core.space.Workspace
    },
    (res) => {
      hiddenAppsIds = res.map((r) => r.attachedTo)
      loaded = true
    }
  )

  function updateExcludedApps (): void {
    const me = getCurrentAccount()

    if (me.role === AccountRole.ReadOnlyGuest || me.role === AccountRole.Guest) {
      excludedApps = getMetadata(workbench.metadata.ExcludedApplicationsForAnonymous) ?? []
    } else {
      excludedApps = []
    }
  }

  updateExcludedApps()

  $: topApps = apps
    .filter((it) => it.position === 'top' && !hiddenAppsIds.includes(it._id) && !excludedApps.includes(it.alias))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
  $: midApps = apps
    .filter(
      (it) =>
        !hiddenAppsIds.includes(it._id) &&
        !excludedApps.includes(it.alias) &&
        it.position !== 'top' &&
        it.position !== 'bottom'
    )
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))

  $: bottomApps = apps.filter(
    (it) => it.position === 'bottom' && !hiddenAppsIds.includes(it._id) && !excludedApps.includes(it.alias)
  )

  const inboxClient = InboxNotificationsClientImpl.getClient()
  const inboxContextsStore = inboxClient.contexts
  const inboxNotificationsByContextStore = inboxClient.inboxNotificationsByContext

  let hasNotificationsFn: ((data: Map<Ref<DocNotifyContext>, InboxNotification[]>) => Promise<boolean>) | undefined =
    undefined
  let hasInboxNotifications = false

  void getResource(notification.function.HasInboxNotifications).then((f) => {
    hasNotificationsFn = f
  })

  $: void hasNotificationsFn?.($inboxNotificationsByContextStore).then((res) => {
    hasInboxNotifications = res
  })

  async function showNotify (
    app: Application,
    contexts: DocNotifyContext[],
    hasOldNotifications: boolean,
    preference: NotificationAppearancePreference | undefined
  ): Promise<boolean> {
    if (app.showNotifyMarkerFn != null) {
      const fn = await getResource(app.showNotifyMarkerFn)
      return await fn(contexts, preference)
    }
    return false
  }

  let menuButton: HTMLButtonElement | undefined
  let notifyApps = new Set<Ref<Application>>()
  let lastApp: Application | undefined

  // Inbox has its own bell button next to this one.
  $: allApps = [...topApps, ...midApps, ...bottomApps].filter((it) => it.alias !== notificationId)
  $: currentApp = allApps.find((it) => it._id === active)
  $: if (currentApp !== undefined) lastApp = currentApp
  // Landing straight in Inbox leaves nothing remembered - fall back to the first app so the button exists.
  $: displayApp = currentApp ?? lastApp ?? allApps[0]

  $: if (compact) {
    void Promise.all(
      allApps.map(async (app) => ({
        _id: app._id,
        notify: await showNotify(app, $inboxContextsStore, hasInboxNotifications, $appearancePreferences)
      }))
    ).then((res) => {
      notifyApps = new Set(res.filter((it) => it.notify).map((it) => it._id))
    })
  }

  function openAppsMenu (): void {
    showPopup(AppsMenuPopup, { apps: allApps, active, notifyApps }, menuButton)
  }

  function goToApp (app: Application): void {
    const loc = getCurrentLocation()
    loc.path[2] = app.alias
    loc.path.length = 3
    loc.fragment = undefined
    loc.query = undefined
    navigate(loc)
  }
</script>

{#if compact}
  <div class="flex-row-center clear-mins compact-apps">
    {#if loaded && displayApp !== undefined}
      {#if currentApp !== undefined}
        <ModernButton
          bind:element={menuButton}
          icon={displayApp.icon}
          label={displayApp.label}
          size={'small'}
          pressed
          hasMenu
          on:click={openAppsMenu}
        />
      {:else}
        <!-- Not in this app right now (e.g. Inbox) - one tap goes back to it. -->
        <ModernButton
          icon={displayApp.icon}
          label={displayApp.label}
          size={'small'}
          hasMenu
          on:click={() => {
            if (displayApp !== undefined) goToApp(displayApp)
          }}
        />
      {/if}
    {/if}
  </div>
{:else}
  <div class="flex-{direction === 'horizontal' ? 'row-center' : 'col-center'} clear-mins apps-{direction} relative">
    {#if loaded}
      <Scroller
        invertScroll
        padding={direction === 'horizontal' ? '.75rem .5rem' : '.5rem .75rem'}
        gap={direction === 'horizontal' ? 'gap-1' : 'gapV-1'}
        horizontal={direction === 'horizontal'}
        contentDirection={direction}
        align={direction === 'horizontal' ? 'center' : 'start'}
        buttons={'union'}
      >
        {#each topApps as app}
          {@const customProps = customAppProps.get(app.alias) ?? {}}
          {#await showNotify(app, $inboxContextsStore, hasInboxNotifications, $appearancePreferences) then notify}
            <NavLink app={app.alias} shrink={0} disabled={app._id === active}>
              <AppItem
                selected={app._id === active}
                icon={app.icon}
                label={app.label}
                navigator={app._id === active && $deviceInfo.navigator.visible}
                {notify}
                {...customProps}
                on:click={getClickHandler(app, customProps)}
              />
            </NavLink>
          {/await}
        {/each}
        {#if topApps.length > 0}
          <div class="divider" />
        {/if}
        {#each midApps as app}
          {@const customProps = customAppProps.get(app.alias) ?? {}}
          <NavLink app={app.alias} shrink={0} disabled={app._id === active}>
            <AppItem
              selected={app._id === active}
              icon={app.icon}
              label={app.label}
              navigator={app._id === active && $deviceInfo.navigator.visible}
              {...customProps}
              on:click={getClickHandler(app, customProps)}
            />
          </NavLink>
        {/each}
        {#if bottomApps.length > 0}
          <div class="divider" />
          {#each bottomApps as app}
            {@const customProps = customAppProps.get(app.alias) ?? {}}
            <NavLink app={app.alias} shrink={0} disabled={app._id === active}>
              <AppItem
                selected={app._id === active}
                icon={app.icon}
                label={app.label}
                navigator={app._id === active && $deviceInfo.navigator.visible}
                notify={false}
                {...customProps}
                on:click={getClickHandler(app, customProps)}
              />
            </NavLink>
          {/each}
        {/if}
        <div class="apps-space-{direction}" />
      </Scroller>
    {/if}
  </div>
{/if}

<style lang="scss">
  .compact-apps {
    flex-shrink: 1;
    min-width: 0;
    margin: 0 0.5rem;
    overflow: hidden;

    // Match the plain AppItem buttons (bell, hamburger) sitting next to it.
    :global(button) {
      height: 2.25rem;
    }
  }
  .apps-horizontal {
    justify-content: center;
    margin: 0 0.5rem 0 0.25rem;
    height: var(--app-panel-width);
    min-height: 4rem;

    .divider {
      margin-left: 0.5rem;
      width: 1px;
      height: 2.25rem;
    }
  }
  .apps-vertical {
    margin-bottom: 0.5rem;
    width: var(--app-panel-width);
    min-width: 4rem;

    .divider {
      margin-top: 1rem;
      width: 2.25rem;
      height: 1px;
    }
  }
  .divider {
    flex-shrink: 0;
    background-color: var(--theme-navpanel-icons-divider);
  }
  .apps-space {
    &-vertical {
      min-height: 0.5rem;
      height: 0.5rem;
    }
    &-horizontal {
      min-width: 0.5rem;
      width: 0.5rem;
    }
  }
</style>
