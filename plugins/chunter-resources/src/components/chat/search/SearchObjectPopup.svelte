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
  import { type Class, type Doc, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { getDocIdentifier, getDocTitle } from '@hcengineering/view-resources'
  import { translate } from '@hcengineering/platform'
  import {
    deviceOptionsStore,
    Label,
    Loading,
    ModernEditbox,
    PopupCategory,
    resizeObserver,
    Scroller,
    themeStore
  } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import chunterPlugin from '@hcengineering/chunter'

  import chunter from '../../../plugin'
  import { getActivityDocClasses } from '../../../search/classes'
  import type { PickedObject } from '../../../search/types'
  import SearchObjectRow from './SearchObjectRow.svelte'

  export let selected: PickedObject[] = []
  export let classes: Array<Ref<Class<Doc>>> | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const PAGE_SIZE = 50

  let search: string = ''
  let loading = false
  let sections: Array<{ _class: Ref<Class<Doc>>, label: string, items: PickedObject[] }> = []
  let generation = 0

  const SECTION_ORDER: Array<Ref<Class<Doc>>> = [
    chunterPlugin.class.Channel,
    chunterPlugin.class.DirectMessage,
    'tracker:class:Issue' as Ref<Class<Doc>>
  ]

  $: searchClasses = classes !== undefined && classes.length > 0 ? classes : getActivityDocClasses()
  $: defaultClasses = classes !== undefined && classes.length > 0 ? classes : SECTION_ORDER

  let debounce: any
  function scheduleLoad (
    query: string,
    lang: string,
    _searchClasses: Array<Ref<Class<Doc>>>,
    _defaultClasses: Array<Ref<Class<Doc>>>
  ): void {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      void load(query, lang, _searchClasses, _defaultClasses)
    }, 200)
  }

  $: scheduleLoad(search, $themeStore.language, searchClasses, defaultClasses)

  onDestroy(() => {
    clearTimeout(debounce)
  })

  function sectionClass (_class: Ref<Class<Doc>>): Ref<Class<Doc>> {
    if (!hierarchy.hasClass(_class)) return _class
    for (const base of SECTION_ORDER) {
      if (base === _class) return base
      if (hierarchy.hasClass(base) && hierarchy.isDerived(_class, base)) return base
    }
    return _class
  }

  async function sectionLabel (_class: Ref<Class<Doc>>, lang: string): Promise<string> {
    if (!hierarchy.hasClass(_class)) return _class
    const clazz = hierarchy.getClass(_class)
    const label = clazz.pluralLabel ?? clazz.label
    if (label === undefined) return _class
    const translated = await translate(label, {}, lang)
    return translated === label ? _class : translated
  }

  function sectionRank (_class: Ref<Class<Doc>>): number {
    const idx = SECTION_ORDER.findIndex((c) => {
      if (c === _class) return true
      return hierarchy.hasClass(c) && hierarchy.hasClass(_class) && hierarchy.isDerived(_class, c)
    })
    return idx === -1 ? SECTION_ORDER.length : idx
  }

  async function toPicked (_id: Ref<Doc>, _class: Ref<Class<Doc>>, doc: Doc | undefined): Promise<PickedObject> {
    const [title, identifier] = await Promise.all([
      getDocTitle(client, _id, _class, doc),
      getDocIdentifier(client, _id, _class, doc)
    ])
    const icon = hierarchy.hasClass(_class) ? hierarchy.getClass(_class).icon : undefined
    return { _id, _class, title: title ?? '', identifier, icon, doc }
  }

  async function loadDefaults (): Promise<PickedObject[]> {
    const found = await Promise.all(
      defaultClasses.map(async (_class) => {
        try {
          const docs = await client.findAll(_class, {}, { limit: PAGE_SIZE })
          return await Promise.all(docs.map(async (d) => await toPicked(d._id, _class, d)))
        } catch (err: any) {
          return []
        }
      })
    )
    return found.flat()
  }

  async function searchObjects (query: string): Promise<PickedObject[]> {
    const found = await client.searchFulltext({ query, classes: searchClasses }, { limit: PAGE_SIZE })
    return await Promise.all(
      found.docs.map(async (doc) => ({
        _id: doc.id,
        _class: doc.doc._class,
        title: doc.title ?? '',
        identifier: await getDocIdentifier(client, doc.id, doc.doc._class),
        icon: doc.icon ?? hierarchy.getClass(doc.doc._class).icon
      }))
    )
  }

  async function load (
    query: string,
    lang: string,
    _searchClasses: Array<Ref<Class<Doc>>>,
    _defaultClasses: Array<Ref<Class<Doc>>>
  ): Promise<void> {
    const gen = ++generation
    loading = true

    try {
      const trimmed = query.trim()
      const picked = trimmed === '' ? await loadDefaults() : await searchObjects(trimmed)
      if (gen !== generation) return

      const byClass = new Map<Ref<Class<Doc>>, PickedObject[]>()
      const seen = new Set<Ref<Doc>>()

      for (const obj of picked) {
        if (obj.title === '' || seen.has(obj._id)) continue
        seen.add(obj._id)
        const key = sectionClass(obj._class)
        const list = byClass.get(key) ?? []
        list.push(obj)
        byClass.set(key, list)
      }

      sections = await Promise.all(
        Array.from(byClass.entries()).map(async ([_class, items]) => {
          items.sort((a, b) => a.title.localeCompare(b.title))
          return { _class, label: await sectionLabel(_class, lang), items }
        })
      )
      sections.sort((a, b) => {
        const byRank = sectionRank(a._class) - sectionRank(b._class)
        return byRank !== 0 ? byRank : a.label.localeCompare(b.label)
      })
    } finally {
      if (gen === generation) loading = false
    }
  }

  $: selectedIds = new Set(selected.map((s) => s._id))

  function toggle (obj: PickedObject): void {
    const next = selectedIds.has(obj._id) ? selected.filter((s) => s._id !== obj._id) : [...selected, obj]
    selected = next
    dispatch('update', next)
  }
</script>

<div class="hulyPopup-container object-popup" use:resizeObserver={() => dispatch('changeContent')}>
  <div class="search-wrapper">
    <ModernEditbox
      bind:value={search}
      label={chunter.string.SearchFilterObject}
      size="small"
      kind="default"
      autoFocus={!$deviceOptionsStore.isMobile}
    />
  </div>

  {#if loading}
    <Loading shrink />
  {:else if sections.length === 0}
    <div class="empty"><Label label={chunter.string.SearchNoResultsTitle} /></div>
  {:else}
    <Scroller padding="var(--spacing-0_5)">
      {#if selected.length > 0}
        <PopupCategory label={chunter.string.SearchFilterSelected} kind="heading" />
        {#each selected as item (item._id)}
          <SearchObjectRow
            {item}
            selected={selectedIds.has(item._id)}
            on:toggle={() => {
              toggle(item)
            }}
          />
        {/each}
      {/if}

      {#each sections.filter((s) => s.items.some((i) => !selectedIds.has(i._id))) as section (section._class)}
        <PopupCategory title={section.label} kind="heading" />
        {#each section.items.filter((i) => !selectedIds.has(i._id)) as item (item._id)}
          <SearchObjectRow
            {item}
            selected={selectedIds.has(item._id)}
            on:toggle={() => {
              toggle(item)
            }}
          />
        {/each}
      {/each}
    </Scroller>
    <div class="more"><Label label={chunter.string.SearchFilterObjectMore} /></div>
  {/if}
</div>

<style lang="scss">
  .object-popup {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 24rem;
    width: 20rem;
  }

  .search-wrapper {
    padding: var(--spacing-1);
    border-bottom: 1px solid var(--theme-popup-divider);
  }

  .more {
    flex-shrink: 0;
    padding: var(--spacing-1) var(--spacing-2);
    font-size: 0.75rem;
    line-height: 1.25;
    color: var(--global-tertiary-TextColor);
    text-align: center;
  }

  .empty {
    padding: var(--spacing-2);
    text-align: center;
    color: var(--theme-darker-color);
  }
</style>
