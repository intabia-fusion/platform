<!--
// Copyright © 2026 Intabia Fusion.
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
  import contact, { Employee } from '@hcengineering/contact'
  import { Class, Doc, getCurrentAccount, notEmpty, Ref, SortingOrder, WithLookup } from '@hcengineering/core'
  import { createQuery, LiveQuery } from '@hcengineering/presentation'
  import { CheckBox, createFocusManager, FocusHandler, Icon, languageStore, ListView } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { Chat, DirectMessage } from '@hcengineering/chunter'

  import chunter from '../plugin'
  import { getActivityDocClasses, getDirectByAccountMap } from './chat/utils'
  import { getChatDocIcon, getChatDocTitle } from '../utils'

  export let search: string = ''
  export let selectedDocs: Doc[] = []
  export let limit = 10
  export let empty = false
  export let loading = true
  export let count = 0

  const dispatch = createEventDispatcher()
  const employeesQuery = createQuery()
  const focusManager = createFocusManager()
  const me = getCurrentAccount()

  let listSelection = 0
  let list: ListView

  const queryByClass = new Map<Ref<Class<Doc>>, LiveQuery>()

  let chatsByClass = new Map<Ref<Class<Doc>>, WithLookup<Chat>[]>()
  let loadedByClass = new Map<Ref<Class<Doc>>, boolean>()

  $: selected = selectedDocs.map((it) => it._id)
  let employees: Employee[] = []
  let loadingEmployees = true

  $: employeesQuery.query(
    contact.mixin.Employee,
    {
      $search: `*${search}*`,
      $searchStrict: true
    },
    (res) => {
      employees = res
      loadingEmployees = false
    },
    {
      limit
    }
  )

  $: loadChats(search)

  function loadChats (search: string): void {
    const classes = getActivityDocClasses()

    for (const _class of classes) {
      const query = queryByClass.get(_class) ?? createQuery()

      if (!queryByClass.has(_class)) {
        queryByClass.set(_class, query)
      }
      if (!loadedByClass.has(_class)) {
        loadedByClass.set(_class, false)
      }

      query.query(
        chunter.class.Chat,
        {
          account: me.uuid,
          attachedToClass: _class,
          ...(search !== ''
            ? {
                $search: search !== '' ? `*${search}*` : undefined,
                $searchStrict: true
              }
            : {}),
          '$lookup.attachedTo._id': { $exists: true }
        },
        (res) => {
          const chats = res.filter((it) => it.$lookup?.attachedTo != null)
          chatsByClass = chatsByClass.set(_class, chats)
          loadedByClass = loadedByClass.set(_class, true)
        },
        {
          total: true,
          limit,
          lookup: {
            attachedTo: _class
          },
          sort: {
            '$lookup.attachedTo.modifiedOn': SortingOrder.Descending
          }
        }
      )
    }

    for (const [classRef, query] of queryByClass.entries()) {
      if (!classes.includes(classRef)) {
        query.unsubscribe()
        queryByClass.delete(classRef)
        loadedByClass.delete(classRef)
        chatsByClass.delete(classRef)
      }
    }
    chatsByClass = chatsByClass
  }

  function handleSelection (doc: Doc | undefined): void {
    if (doc == null) return
    if (selected.includes(doc._id)) {
      selectedDocs = selectedDocs.filter((it) => it._id !== doc._id)
    } else {
      selectedDocs = [...selectedDocs, doc]
    }

    dispatch('select', selectedDocs)
  }

  function onKeydown (key: KeyboardEvent): void {
    if (key.code === 'ArrowUp') {
      key.stopPropagation()
      key.preventDefault()
      list.select(listSelection - 1)
    }
    if (key.code === 'ArrowDown') {
      key.stopPropagation()
      key.preventDefault()
      list.select(listSelection + 1)
    }
    if (key.code === 'Enter') {
      key.preventDefault()
      key.stopPropagation()
      handleSelection(displayDocs[listSelection])
    }
  }

  let displayDocs: WithLookup<Doc>[] = []
  $: updateDisplayDocs(chatsByClass, employees)

  function updateDisplayDocs (
    chatsByClass: Map<Ref<Class<Doc>>, WithLookup<Chat>[]>,
    employees: WithLookup<Employee>[]
  ): void {
    const directs = (chatsByClass.get(chunter.class.DirectMessage) ?? [])
      .map((it) => it.$lookup?.attachedTo)
      .filter(notEmpty) as DirectMessage[]

    const _displayDocs = Array.from(chatsByClass.values())
      .flatMap((chats) =>
        chats.map((it) => {
          const doc = it.$lookup?.attachedTo
          if (doc != null) {
            ;(doc as WithLookup<Doc>).$source = it.$source
          }
          return doc as WithLookup<Doc>
        })
      )
      .filter(notEmpty)

    const directByPerson = getDirectByAccountMap(directs)
    for (const employee of employees) {
      if (_displayDocs.length >= 10) break
      if (employee.personUuid == null) continue
      const direct = directByPerson.get(employee.personUuid)
      if (direct != null) continue
      _displayDocs.push(employee)
    }

    if (search === '') {
      displayDocs = _displayDocs.sort((a, b) => b.modifiedOn - a.modifiedOn).slice(0, limit)
    } else {
      displayDocs = _displayDocs.sort((a, b) => (b.$source?.$score ?? 0) - (a.$source?.$score ?? 0)).slice(0, limit)
    }
  }

  $: loading = loadedByClass.values().some((it) => !it) || loadingEmployees
  $: empty = !loading && displayDocs.length === 0
  $: count = loading ? 0 : displayDocs.length
</script>

<FocusHandler manager={focusManager} />

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="w-full" tabindex="0" on:keydown={onKeydown}>
  <ListView
    bind:this={list}
    count={loading ? 0 : displayDocs.length}
    bind:selection={listSelection}
    colorsSchema="lumia"
    noScroll
  >
    <svelte:fragment slot="item" let:item={index}>
      {@const doc = displayDocs[index]}
      <button
        class="row withList w-full"
        class:cursor-default={false}
        on:click|stopPropagation|preventDefault={() => {
          handleSelection(doc)
        }}
      >
        <span class="flex-row-center">
          {#await getChatDocIcon(doc) then icon}
            <span
              class="icon"
              class:withBackground={icon.withIconBackground}
              class:w-auto={icon.iconSize === 'x-small'}
            >
              <Icon icon={icon.icon} size={icon.iconSize} iconProps={{ ...icon.iconProps, value: doc }} />
            </span>
          {/await}
          <span class="flex-col min-w-0 ml-3">
            <span class="label overflow-label text-left">
              {#await getChatDocTitle(doc, $languageStore) then title}
                {#if title.identifier}
                  <span class="identifier">
                    {title.identifier}
                  </span>
                {/if}
                {title.title}
              {/await}
            </span>
          </span>
        </span>
        <CheckBox
          checked={selected.includes(doc._id)}
          readonly={false}
          kind="primary"
          on:value={() => {
            handleSelection(doc)
          }}
        />
      </button>
    </svelte:fragment>
  </ListView>
</div>

<style lang="scss">
  .row {
    display: flex;
    align-items: center;
    padding: var(--spacing-1) var(--spacing-2) var(--spacing-1) var(--spacing-1);
    flex-grow: 1;
    border-radius: var(--small-BorderRadius);
    justify-content: space-between;
    margin-bottom: 0.125rem;
    height: 2.625rem;
  }

  .label {
    color: var(--global-primary-TextColor);
    font-weight: 400;
  }

  .identifier {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: var(--spacing-1);
    width: var(--global-min-Size);
    height: var(--global-min-Size);
    min-width: var(--global-min-Size);
    color: var(--global-primary-TextColor);
    min-height: 1.5rem;

    &.withBackground {
      width: var(--global-extra-small-Size);
      height: var(--global-extra-small-Size);
      background: var(--global-ui-BackgroundColor);
      border: 1px solid var(--global-subtle-ui-BorderColor);
      border-radius: var(--extra-small-BorderRadius);
    }
  }
</style>
