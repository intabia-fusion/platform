<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { Class, Doc, DocPreview, Ref, SearchTarget, WithLookup } from '@hcengineering/core'
  import core, { getCurrentAccount, reduceCalls, SortingOrder } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import type { LiveQuery } from '@hcengineering/presentation'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Chat } from '@hcengineering/chunter'
  import type { Employee } from '@hcengineering/contact'
  import notification from '@hcengineering/notification'
  import { previewMembers } from '@hcengineering/view-resources'
  import { createEventDispatcher, onDestroy, tick } from 'svelte'

  import chunter from '../../../plugin'
  import { getChannelSpace } from '../../../utils'
  import type { ChatNavEntry, ChatNavGroupModel } from '../types'
  import ChatNavSection from './ChatNavSection.svelte'
  import {
    createFakeDirectFromEmployee,
    getDirectPreviewByAccountMap,
    getNavGroupClasses,
    isPersonDirect,
    shouldPushObjectInNavigator,
    standInPreview
  } from '../utils'

  export let object: Doc | undefined
  export let chat: Chat | undefined
  export let selectedId: Ref<Doc> | undefined
  export let model: ChatNavGroupModel
  export let search: string = ''
  export let employees: Employee[] = []
  export let active: boolean = true

  const dispatch = createEventDispatcher<{ loaded: undefined }>()

  interface Section {
    id: string
    _class?: Ref<Class<Doc>>
    label: IntlString
    entries: ChatNavEntry[]
    count: number
  }

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const queryByClass = new Map<Ref<Class<Doc>>, { query: LiveQuery, limit?: number, extra: number }>()

  const me = getCurrentAccount()
  let entriesByClass = new Map<Ref<Class<Doc>>, { entries: ChatNavEntry[], total: number }>()

  let shouldPushObject = false
  let sections: Section[] = []

  const fakeDirectsHistory = new Map<string, any>()
  // One fake per person while the search lasts: the section keeps its row as is
  const fakeDirects = new Map<string, DocPreview>()
  let lastSearch = search
  $: if (search !== lastSearch) {
    lastSearch = search
    fakeDirectsHistory.clear()
    fakeDirects.clear()
  }

  $: shouldPushObject = shouldPushObjectInNavigator(model, object, chat, Array.from(entriesByClass.keys()))
  $: pushObj = shouldPushObject && object != null ? { object, chat } : undefined

  let loadedReported = false
  const answeredClasses = new Set<Ref<Class<Doc>>>()

  function reportLoaded (classes: Array<Ref<Class<Doc>>>): void {
    if (loadedReported || !classes.every((it) => answeredClasses.has(it))) return
    loadedReported = true
    // A group without classes reports during its own initialisation, before the parent has
    // attached its listener: the event goes out a tick later.
    void tick().then(() => dispatch('loaded'))
  }

  function loadEntries (model: ChatNavGroupModel, search: string): void {
    const classes = getNavGroupClasses(model)
    reportLoaded(classes)

    for (const _class of classes) {
      const { query, limit, extra } = queryByClass.get(_class) ?? {
        query: createQuery(),
        limit: model.maxSectionItems,
        extra: 0
      }

      if (!queryByClass.has(_class)) {
        queryByClass.set(_class, { query, limit, extra })
      }

      const searchQuery =
        search !== ''
          ? {
              $search: search !== '' ? `*${search}*` : undefined,
              $searchIn: ['title', 'identifier'] as SearchTarget[]
            }
          : {
              hidden: false
            }

      query.query(
        chunter.class.Chat,
        {
          ...model.query,
          account: me.uuid,
          ...(_class !== core.class.Doc
            ? {
                attachedToClass: { $in: hierarchy.getDescendants(_class) },
                '$lookup.readState.attachedToClass': { $in: hierarchy.getDescendants(_class) }
              }
            : {}),
          ...searchQuery,
          '$lookup.preview.archived': false
        },
        (res) => {
          // A preview the user may not read (a project archived or left) is cut from the join: no row
          const entries: ChatNavEntry[] = res.flatMap((chat) => {
            const preview = chat.$lookup?.preview as DocPreview | undefined
            return preview != null ? [{ preview, chat }] : []
          })
          // The cut rows still take places of the page: ask for more, doubling, while there are
          const page = queryByClass.get(_class)
          const cut = res.length - entries.length
          if (page?.limit != null && entries.length < page.limit && res.length < res.total && cut > page.extra) {
            page.extra = Math.max(cut, page.extra * 2)
            loadEntries(model, search)
            return
          }
          // A window grown for cut rows shows no more than the page
          const shown = page?.limit != null ? entries.slice(0, page.limit) : entries
          entriesByClass = entriesByClass.set(_class, { entries: shown, total: res.total - cut })
          answeredClasses.add(_class)
          reportLoaded(classes)
        },
        {
          total: true,
          limit: limit != null ? limit + extra : undefined,
          lookup: { preview: core.class.DocPreview, readState: notification.class.ReadState },
          projection: { '$lookup.readState.latestMessageTimestamp': 1, '$lookup.readState.attachedToClass': 1 },
          sort: { '$lookup.readState.latestMessageTimestamp': SortingOrder.Descending }
        }
      )
    }

    for (const [classRef, query] of queryByClass.entries()) {
      if (!classes.includes(classRef)) {
        query.query.unsubscribe()
        queryByClass.delete(classRef)
        entriesByClass.delete(classRef)
      }
    }
    entriesByClass = entriesByClass
  }

  const searchDebounceMs = 300
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
  let debouncedSearch = search

  $: if (search === '' || search === debouncedSearch) {
    // Empty search (e.g. cleared, or the initial value) and no-op changes apply immediately.
    if (searchDebounceTimer != null) {
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = undefined
    }
    debouncedSearch = search
  } else {
    if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = undefined
      debouncedSearch = search
    }, searchDebounceMs)
  }

  $: if (active) loadEntries(model, debouncedSearch)

  onDestroy(() => {
    if (searchDebounceTimer != null) clearTimeout(searchDebounceTimer)

    for (const { query } of queryByClass.values()) {
      query.unsubscribe()
    }
  })

  // The open document when it is not listed: its preview, live; a stand-in for a document without one
  const pushedQuery = createQuery()
  let pushedPreview: DocPreview | undefined
  $: if (pushObj != null) {
    const { object } = pushObj
    const space = getChannelSpace(object._class, object._id, object.space)
    pushedQuery.query(
      core.class.DocPreview,
      // The space lets the query read a public one its user is not a member of
      { objectId: object._id, objectDomain: hierarchy.getDomain(object._class), space },
      (res) => {
        pushedPreview = res[0] ?? standInPreview(object._id, object._class, space)
      },
      { limit: 1, showArchived: true }
    )
  } else {
    pushedQuery.unsubscribe()
    pushedPreview = undefined
  }

  const getSections = reduceCalls(
    async (
      entriesByClass: Map<Ref<Class<Doc>>, { entries: ChatNavEntry[], total: number }>,
      model: ChatNavGroupModel,
      pushObject: { object: Doc, chat?: Chat } | undefined,
      pushedPreview: DocPreview | undefined,
      employees: Employee[],
      handler: (result: Section[]) => void
    ): Promise<void> => {
      const result: Section[] = []
      if (!model.wrap) {
        result.push({
          id: model.id,
          entries: Array.from(entriesByClass.values()).flatMap((it) => it.entries),
          label: model.label ?? chunter.string.Channels,
          count: Array.from(entriesByClass.values()).reduce((sum, it) => sum + it.total, 0)
        })

        handler(result)
        return
      }

      let isObjectPushed = false

      const docIds = new Set(entriesByClass.values().flatMap((it) => it.entries.map((o) => o.preview.objectId)))
      if (pushObject != null && docIds.has(pushObject?.object._id)) {
        isObjectPushed = true
      }
      const pushed: ChatNavEntry | undefined =
        pushObject != null && !isObjectPushed && pushedPreview?.objectId === pushObject.object._id
          ? { preview: pushedPreview, chat: pushObject.chat }
          : undefined

      for (const [_class, { entries, total }] of entriesByClass.entries()) {
        const clazz = hierarchy.getClass(_class)
        const sectionEntries: ChatNavEntry[] = [...entries]

        if (!isObjectPushed && pushed != null && _class === pushObject?.object._class) {
          isObjectPushed = true
          sectionEntries.push(pushed)
        }

        if (model.id === 'direct' && _class === chunter.class.DirectMessage) {
          for (const it of sectionEntries) {
            if (!isPersonDirect(it.preview)) continue
            const other = (previewMembers(it.preview) ?? []).find((m) => m !== me.uuid) ?? me.uuid
            const historySource = fakeDirectsHistory.get(other)
            if (historySource != null) {
              ;(it.preview as WithLookup<DocPreview>).$source = historySource
              if (it.chat != null) {
                ;(it.chat as WithLookup<Chat>).$source = historySource
              }
            }
          }

          const directByPerson = getDirectPreviewByAccountMap(sectionEntries.map((it) => it.preview))
          for (const employee of employees) {
            if (sectionEntries.length >= 10) break
            if (employee.personUuid == null) continue
            const direct = directByPerson.get(employee.personUuid)
            if (direct != null) continue
            const fakeDirect = fakeDirects.get(employee.personUuid) ?? createFakeDirectFromEmployee(employee)
            if (fakeDirect == null) continue
            fakeDirects.set(employee.personUuid, fakeDirect)
            fakeDirectsHistory.set(employee.personUuid, (employee as WithLookup<Employee>).$source)
            sectionEntries.push({ preview: fakeDirect })
          }
        }

        result.push({
          id: _class,
          _class,
          entries: sectionEntries,
          label: clazz.pluralLabel ?? clazz.label,
          count: sectionEntries.length > entries.length ? total + 1 : total
        })
      }

      if (!isObjectPushed && pushed != null && pushObject != null) {
        const clazz = hierarchy.getClass(pushObject.object._class)

        result.push({
          id: pushObject.object._id,
          _class: pushObject.object._class,
          entries: [pushed],
          label: clazz.pluralLabel ?? clazz.label,
          count: 1
        })
      }

      handler(result.sort((s1, s2) => s1.label.localeCompare(s2.label)))
    }
  )

  $: void getSections(entriesByClass, model, pushObj, pushedPreview, employees, (res) => {
    sections = res
  })
</script>

{#each sections as section (section.id)}
  {#if section.entries.length > 0 || model.showEmpty}
    <ChatNavSection
      id={section.id}
      _class={section._class ?? core.class.Doc}
      entries={section.entries}
      objectId={selectedId}
      header={section.label}
      actions={model.actionsFn()}
      createAction={model.createAction}
      showEmpty={model.showEmpty}
      itemsCount={section.count}
      on:show-more={() => {
        if (section._class !== undefined) {
          const query = queryByClass.get(section._class)
          if (query?.limit != null) {
            query.limit += 50
            loadEntries(model, search)
          }
        }
      }}
      on:select
    />
  {/if}
{/each}
