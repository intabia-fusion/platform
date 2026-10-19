<script lang="ts">
  import contact from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import { getCurrentAccount, toIdMap } from '@hcengineering/core'
  import { copyTextToClipboard, createQuery, getClient } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import type { Action, Location } from '@hcengineering/ui'
  import {
    IconAdd,
    SelectPopup,
    eventToHTMLElement,
    getEventPopupPositionElement,
    getLocation,
    getPopupPositionElement,
    location,
    locationToUrl,
    navigate,
    showPopup
  } from '@hcengineering/ui'
  import type { Filter, FilteredView, FilteredViewPreference, ViewOptions, Viewlet } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import {
    EditBoxPopup,
    SortableList,
    TreeItem,
    TreeNode,
    activeViewlet,
    applySavedViewOrder,
    filterStore,
    getViewOptions,
    makeViewletKey,
    selectedFilterStore,
    setActiveViewletId,
    setFilters,
    setSavedViewOrder,
    setViewOptions,
    viewOptionStore
  } from '@hcengineering/view-resources'
  import copy from 'fast-copy'
  import { createEventDispatcher } from 'svelte'
  import TodoCheck from './icons/TodoCheck.svelte'
  import TodoUncheck from './icons/TodoUncheck.svelte'

  export let alias: string | undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const myAcc = getCurrentAccount()

  const filteredViewsQuery = createQuery()
  const savedViewOrderQuery = createQuery()
  let allMyFilteredViews: FilteredView[] = []
  let savedViewOrder: Ref<FilteredView>[] = []
  let savedViewOrderPreference: FilteredViewPreference | undefined
  let myFilteredViews: FilteredView[] = []
  let availableFilteredViews: FilteredView[] = []

  $: myFilteredViews = applySavedViewOrder(allMyFilteredViews, savedViewOrder)

  $: if (alias !== undefined) {
    filteredViewsQuery.query<FilteredView>(view.class.FilteredView, { attachedTo: alias }, (result) => {
      allMyFilteredViews = result.filter((p) => p.users.includes(myAcc.uuid))
      availableFilteredViews = result.filter((p) => p.sharable && !p.users.includes(myAcc.uuid))

      const location = getLocation()
      if (location.query?.filterViewId) {
        const targetView = result.find((view) => view._id === location.query?.filterViewId)
        if (targetView) {
          void load(targetView)
        }
      }
    })
    savedViewOrderQuery.query<FilteredViewPreference>(
      view.class.FilteredViewPreference,
      { attachedTo: alias },
      (result) => {
        savedViewOrderPreference = result[0]
        savedViewOrder = savedViewOrderPreference?.views ?? []
      }
    )
  } else {
    filteredViewsQuery.unsubscribe()
    savedViewOrderQuery.unsubscribe()
    allMyFilteredViews = []
    savedViewOrder = []
    savedViewOrderPreference = undefined
    myFilteredViews = []
    availableFilteredViews = []
  }

  async function removeAction (filteredView: FilteredView): Promise<Action[]> {
    return [
      {
        icon: view.icon.Delete,
        label: setting.string.Delete,
        action: async (ctx: any, evt: Event) => {
          await client.remove(filteredView)
        }
      }
    ]
  }

  async function renameAction (object: FilteredView, originalEvent: MouseEvent | undefined): Promise<Action[]> {
    return [
      {
        icon: contact.icon.Edit,
        label: view.string.Rename,
        action: async (ctx: any, evt: Event) => {
          showPopup(
            EditBoxPopup,
            { value: object.name, format: 'text' },
            getEventPopupPositionElement(originalEvent ?? evt),
            async (res) => {
              if (res !== undefined) {
                await client.update(object, { name: res })
              }
            }
          )
        }
      }
    ]
  }

  async function switchPublicAction (object: FilteredView, originalEvent: MouseEvent | undefined): Promise<Action[]> {
    return [
      {
        icon: object.sharable ? TodoCheck : TodoUncheck,
        label: view.string.PublicView,
        action: async (ctx: any, evt: Event) => {
          await client.update(object, { sharable: !object.sharable })
        }
      }
    ]
  }

  async function copyUrlAction (filteredView: FilteredView): Promise<Action[]> {
    return [
      {
        icon: view.icon.CopyLink,
        label: view.string.CopyToClipboard,
        inline: true,
        action: async (ctx: any, evt: Event) => {
          const { protocol, hostname, port } = window.location
          const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ''}`
          const query = filteredView.location.query || {}
          query.filterViewId = filteredView._id

          const targetUrl = locationToUrl({
            path: filteredView.location.path,
            query,
            fragment: filteredView.location.fragment ?? undefined
          })
          void copyTextToClipboard(baseUrl + targetUrl)
        }
      }
    ]
  }

  async function viewAction (filteredView: FilteredView, originalEvent: MouseEvent | undefined): Promise<Action[]> {
    const copyUrl = await copyUrlAction(filteredView)
    const rename = await renameAction(filteredView, originalEvent)
    const setPublic = await switchPublicAction(filteredView, originalEvent)
    const hide = await hideAction(filteredView)

    if (filteredView.createdBy !== undefined && myAcc.socialIds.includes(filteredView.createdBy)) {
      const remove = await removeAction(filteredView)
      return [...setPublic, ...rename, ...remove, ...copyUrl]
    }
    return [...hide, ...copyUrl]
  }

  async function hideAction (object: FilteredView): Promise<Action[]> {
    return [
      {
        icon: view.icon.Archive,
        label: view.string.Hide,
        action: async (ctx: any, evt: Event) => {
          await client.update(object, { $pull: { users: myAcc.uuid } })
        }
      }
    ]
  }

  let selectedId: Ref<FilteredView> | undefined = undefined

  async function load (fv: FilteredView): Promise<void> {
    selectedFilterStore.set(fv)
    navigate({
      path: fv.location.path,
      query: fv.location.query ?? undefined,
      fragment: fv.location.fragment ?? undefined
    })
    if (fv.viewletId !== undefined && fv.viewletId !== null) {
      const viewlet = await client.findOne<Viewlet>(view.class.Viewlet, { _id: fv.viewletId })
      setActiveViewletId(fv.viewletId, fv.location)
      if (viewlet !== undefined && fv.viewOptions !== undefined) {
        setViewOptions(viewlet, copy(fv.viewOptions))
      }
    }
    setFilters(JSON.parse(fv.filters))
  }

  let saveChain: Promise<void> = Promise.resolve()

  function moveFilteredView (
    event: CustomEvent<{
      item: FilteredView
      prev: FilteredView | undefined
      next: FilteredView | undefined
      items: FilteredView[]
    }>
  ): void {
    if (alias === undefined) return
    const targetAlias = alias
    const preference = savedViewOrderPreference
    const previous = savedViewOrder
    // Only visible views are persisted, so a hidden view (Hide action) loses its position
    // and returns to the end of the list when the user adds it back.
    const order = event.detail.items.map((it) => it._id)
    savedViewOrder = order

    saveChain = saveChain.then(async () => {
      try {
        await setSavedViewOrder(targetAlias, order, preference)
      } catch (err: any) {
        if (savedViewOrder === order) {
          savedViewOrder = previous
        }
        console.error('Failed to save filtered views order', err)
      }
    })
  }

  const clearSelection = (): void => {
    selectedFilterStore.set(undefined)
    selectedId = undefined
    dispatch('select', false)
  }

  function checkFilter (
    fv: FilteredView,
    loc: Location,
    filters: string,
    viewOptionStore: Map<string, ViewOptions>
  ): boolean {
    if (fv.location.path.join() !== loc.path.join()) return false
    if (fv.filters !== filters) return false
    const key = makeViewletKey(loc)
    if (fv.viewletId !== $activeViewlet[key]) return false
    if (fv.viewletId !== null) {
      const viewOptions = getViewOptions({ _id: fv.viewletId } as unknown as Viewlet, viewOptionStore)
      if (JSON.stringify(fv.viewOptions) !== JSON.stringify(viewOptions)) return false
    }
    return true
  }

  function checkSelected (
    fs: Filter[],
    loc: Location,
    filteredViews: FilteredView[] | undefined,
    viewOptionStore: Map<string, ViewOptions>
  ): void {
    const filters = JSON.stringify(fs)
    if (loc && Array.isArray(fs) && fs.length > 0 && Array.isArray(filteredViews)) {
      if ($selectedFilterStore !== undefined) {
        if ($selectedFilterStore.location.path.join() === loc.path.join()) {
          selectedId = $selectedFilterStore._id
          dispatch('select', true)
          return
        }
      }
      for (const fv of filteredViews) {
        if (checkFilter(fv, loc, filters, viewOptionStore)) {
          selectedId = fv._id
          dispatch('select', true)
          return
        }
      }
      clearSelection()
    } else {
      clearSelection()
    }
  }

  $: checkSelected($filterStore, $location, myFilteredViews, $viewOptionStore)

  $: shown = myFilteredViews.length > 0 || availableFilteredViews.length > 0
  $: dispatch('shown', shown)

  async function getActions (availableFilteredViews: FilteredView[]): Promise<Action[]> {
    if (availableFilteredViews.length > 0) {
      const filteredViewsIdMap = toIdMap(availableFilteredViews)
      const pushMeToFV = async (id: Ref<FilteredView>): Promise<void> => {
        if (id === undefined) return
        const filteredView = filteredViewsIdMap.get(id)
        if (filteredView) await client.update(filteredView, { $push: { users: myAcc.uuid } })
      }
      const value = availableFilteredViews.map((p) => ({
        id: p._id,
        text: p.name
      }))
      const add: Action = {
        label: view.string.AddSavedView,
        icon: IconAdd,
        action: async (_, e): Promise<void> => {
          showPopup(
            SelectPopup,
            { value, searchable: true },
            getPopupPositionElement(eventToHTMLElement(e as MouseEvent), {
              v: 'top',
              h: 'right'
            }),
            pushMeToFV
          )
        }
      }
      return [add]
    } else {
      return []
    }
  }
  $: visibleFilter = myFilteredViews.find((fv) => fv._id === selectedId)
</script>

{#if shown}
  <TreeNode
    _id="tree-saved"
    label={view.string.FilteredViews}
    highlighted={selectedId !== undefined}
    actions={async () => await getActions(availableFilteredViews)}
    isFold
    empty={myFilteredViews.length === 0}
    visible={selectedId !== undefined}
  >
    <div class="saved-views-list">
      <SortableList items={myFilteredViews} on:move={moveFilteredView}>
        <svelte:fragment slot="object" let:value>
          <TreeItem
            _id={value._id}
            title={value.name}
            selected={selectedId === value._id}
            on:click={async () => {
              await load(value)
            }}
            actions={async (ov) => await viewAction(value, ov)}
          />
        </svelte:fragment>
      </SortableList>
    </div>

    <svelte:fragment slot="visible">
      {#if visibleFilter}
        {@const item = visibleFilter}
        <TreeItem _id={item._id} title={item.name} selected actions={async (ov) => await viewAction(item, ov)} />
      {/if}
    </svelte:fragment>
  </TreeNode>
{/if}

<style lang="scss">
  .saved-views-list {
    min-width: 0;
  }

  .saved-views-list :global(.item) {
    display: flex;
    min-width: 0;
  }

  .saved-views-list :global(.item > button) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
