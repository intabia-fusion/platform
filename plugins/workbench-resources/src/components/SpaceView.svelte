<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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
  import type { Class, Doc, Ref, Space, WithLookup } from '@hcengineering/core'
  import core, { getCurrentAccount, SortingOrder } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, reduceCalls } from '@hcengineering/presentation'
  import type { AnyComponent, EmptyStateAction } from '@hcengineering/ui'
  import { Component, EmptyState, resolvedLocationStore, showPopup } from '@hcengineering/ui'
  import type { EmptyStateInfo, ViewOptions, Viewlet } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import {
    activeViewlet,
    getViewOptions,
    makeViewletKey,
    onboardingHints,
    openDoc,
    updateActiveViewlet,
    viewOptionStore
  } from '@hcengineering/view-resources'
  import type { NavigatorModel, ViewConfiguration } from '@hcengineering/workbench'
  import workbench from '../plugin'
  import { onDestroy } from 'svelte'
  import { doNavigate, getSpaceName } from '../utils'
  import SpaceContent from './SpaceContent.svelte'
  import SpaceHeader from './SpaceHeader.svelte'

  export let currentSpace: Ref<Space> | undefined
  export let currentView: ViewConfiguration | undefined
  export let createItemDialog: AnyComponent | undefined = undefined
  export let createItemLabel: IntlString | undefined = undefined
  export let navigatorModel: NavigatorModel | undefined = undefined

  let recentSpaces: Space[] = []
  const recentSpacesQuery = createQuery()
  $: firstSpaceModel = navigatorModel?.spaces[0]
  $: emptyStateInfo =
    firstSpaceModel !== undefined
      ? getClient().getHierarchy().classHierarchyMixin(firstSpaceModel.spaceClass, view.mixin.EmptyStateInfo)
      : undefined
  $: spaceClasses = navigatorModel?.spaces.map((s) => s.spaceClass) ?? []
  $: if (currentSpace === undefined && currentView === undefined && spaceClasses.length > 0) {
    recentSpacesQuery.query(
      core.class.Space,
      { _class: { $in: spaceClasses }, members: getCurrentAccount().uuid, archived: false },
      (res) => {
        recentSpaces = res
      },
      { sort: { modifiedOn: SortingOrder.Descending }, limit: 3 }
    )
  } else {
    recentSpacesQuery.unsubscribe()
    recentSpaces = []
  }

  // getClient(): runs before the `client` const below in source order (no hoisting).
  let recentSpaceNames = new Map<Ref<Space>, string>()
  $: void Promise.all(recentSpaces.map(async (s) => [s._id, await getSpaceName(getClient(), s)] as const)).then(
    (entries) => {
      recentSpaceNames = new Map(entries)
    }
  )

  // Some space classes (e.g. Drive) have no workbench SpaceView and open through the object
  // panel instead - navigating them like a regular space would leave the content area blank.
  async function openSpace (s: Space): Promise<void> {
    const hierarchy = getClient().getHierarchy()
    const hasSpaceView = hierarchy.classHierarchyMixin(s._class, workbench.mixin.SpaceView) !== undefined
    const hasObjectPanel = hierarchy.classHierarchyMixin(s._class, view.mixin.ObjectPanel) !== undefined
    if (!hasSpaceView && hasObjectPanel) {
      await openDoc(hierarchy, s)
    } else {
      await doNavigate(s, undefined, { mode: 'space', space: s._id })
    }
  }

  function getEmptyChoices (recentSpaces: Space[], names: Map<Ref<Space>, string>): EmptyStateAction[] {
    return recentSpaces
      .filter((s) => names.has(s._id))
      .map((s) => ({
        title: names.get(s._id) as string,
        onClick: () => {
          void openSpace(s)
        }
      }))
  }

  function getEmptyActions (
    hints: boolean,
    firstSpaceModel: NavigatorModel['spaces'][number] | undefined,
    info: EmptyStateInfo | undefined
  ): EmptyStateAction[] {
    const createComponent = firstSpaceModel?.createComponent
    if (!hints || createComponent === undefined) return []
    return [
      {
        label: info?.createLabel ?? view.string.EmptyStateCreateLabel,
        onClick: () => {
          showPopup(createComponent, {}, 'top')
        }
      }
    ]
  }
  $: emptyChoices = getEmptyChoices(recentSpaces, recentSpaceNames)
  $: emptyActions = getEmptyActions($onboardingHints, firstSpaceModel, emptyStateInfo)

  let search: string = ''
  let viewlet: WithLookup<Viewlet> | undefined = undefined
  let viewOptions: ViewOptions | undefined
  let space: Space | undefined
  let _class: Ref<Class<Doc>> | undefined = undefined
  let header: AnyComponent | undefined

  const client = getClient()

  let viewlets: Array<WithLookup<Viewlet>> = []

  let key = makeViewletKey()
  onDestroy(
    resolvedLocationStore.subscribe((loc) => {
      key = makeViewletKey(loc)
    })
  )

  $: active = $activeViewlet[key]

  const update = reduceCalls(async function update (
    active: Ref<Viewlet> | null,
    currentSpace?: Ref<Space>,
    attachTo?: Ref<Class<Doc>>
  ): Promise<void> {
    if (currentSpace === undefined) {
      space = undefined
      return
    }
    space = await client.findOne(core.class.Space, { _id: currentSpace })
    if (space === undefined) {
      header = undefined
    } else {
      header = await getHeader(space._class)
    }
    if (attachTo) {
      viewlets = await client.findAll(
        view.class.Viewlet,
        { attachTo, variant: { $exists: false } },
        {
          lookup: {
            descriptor: view.class.ViewletDescriptor
          }
        }
      )
      if (header !== undefined) {
        viewlet = updateActiveViewlet(viewlets, active)
        viewOptions = getViewOptions(viewlet, $viewOptionStore)
      }
      _class = attachTo
    }
  })

  $: void update(active, currentSpace, currentView?.class)

  const hierarchy = client.getHierarchy()
  async function getHeader (_class: Ref<Class<Space>>): Promise<AnyComponent | undefined> {
    const clazz = hierarchy.getClass(_class)
    const headerMixin = hierarchy.as(clazz, view.mixin.SpaceHeader)
    if (headerMixin?.header == null && clazz.extends != null) return await getHeader(clazz.extends)
    return headerMixin.header
  }
  function setViewlet (e: CustomEvent<WithLookup<Viewlet>>): void {
    viewlet = e.detail
  }
</script>

{#if _class && space}
  {#if header}
    <Component
      is={header}
      props={{ spaceId: space._id, viewlets, viewlet, createItemDialog, createItemLabel }}
      on:change={setViewlet}
    />
  {:else}
    <SpaceHeader
      viewletQuery={{ attachTo: currentView?.class, variant: { $exists: false } }}
      spaceId={space._id}
      {_class}
      {createItemDialog}
      {createItemLabel}
      bind:viewOptions
      bind:search
      bind:viewlet
    />
  {/if}
  {#if viewOptions}
    <SpaceContent space={space._id} {_class} {createItemDialog} {viewOptions} {createItemLabel} bind:search {viewlet} />
  {/if}
{:else}
  <EmptyState
    title={workbench.string.SelectToOpen}
    description={emptyStateInfo?.description}
    icon={firstSpaceModel?.icon}
    choices={emptyChoices}
    actions={emptyActions}
  />
{/if}
