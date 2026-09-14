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
  import core, { notEmpty, type AccountUuid, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
  import activity from '@hcengineering/activity'
  import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
  import {
    Avatar,
    CombineAvatars,
    employeeByIdStore,
    employeeRefByAccountUuidStore,
    UsersPopup
  } from '@hcengineering/contact-resources'
  import chunterPlugin from '@hcengineering/chunter'
  import { getClient } from '@hcengineering/presentation'
  import {
    RangeDatePopup,
    IconAttachment,
    IconCalendar,
    IconClose,
    Label,
    ModernButton,
    ModernDropdownLabels,
    showPopup,
    themeStore,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { translate, translateCB } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import { expandClasses, getActivityDocClasses, splitPrimaryClasses } from '../../../search/classes'
  import { endOfDay, pickAuthors as resolveAuthors, startOfDay } from '../../../search/resolve'
  import type { ChatSearchFilters, PickedObject } from '../../../search/types'
  import FilterButtonContent from './FilterButtonContent.svelte'
  import SearchObjectPopup from './SearchObjectPopup.svelte'
  import SearchOptionsPopup from './SearchOptionsPopup.svelte'

  export let filters: ChatSearchFilters = {}
  export let compact: boolean = false
  export let space: Ref<Space> | undefined = undefined

  const dispatch = createEventDispatcher()
  const client = getClient()

  function update (patch: Partial<ChatSearchFilters>): void {
    filters = { ...filters, ...patch }
    dispatch('change', filters)
  }

  const ALL_CLASSES = '$all'
  const THREADS = activity.class.ActivityMessage

  async function toItem (_class: Ref<Class<Doc>>, lang: string): Promise<DropdownTextItem> {
    const clazz = client.getHierarchy().getClass(_class)
    return { id: _class, label: await translate(clazz.label, {}, lang), icon: clazz.icon }
  }

  async function buildClassItems (lang: string): Promise<DropdownTextItem[]> {
    const { primary, rest } = splitPrimaryClasses(getActivityDocClasses())

    const primaryItems = await Promise.all(primary.map(async (c) => await toItem(c, lang)))
    const restItems = await Promise.all(rest.map(async (c) => await toItem(c, lang)))
    restItems.sort((a, b) => a.label.localeCompare(b.label))

    const threadsItem: DropdownTextItem = {
      id: THREADS,
      label: await translate(chunter.string.SearchFilterThreads, {}, lang),
      icon: chunter.icon.Thread
    }

    if (primaryItems[0] !== undefined) {
      primaryItems[0].separatorLabel = chunter.string.SearchFilterSuggestedClasses
    } else {
      threadsItem.separatorLabel = chunter.string.SearchFilterSuggestedClasses
    }

    const afterDirect = primaryItems.findIndex((i) => i.id === chunterPlugin.class.DirectMessage)
    const insertAt = afterDirect === -1 ? primaryItems.length : afterDirect + 1
    primaryItems.splice(insertAt, 0, threadsItem)

    const items: DropdownTextItem[] = [
      {
        id: ALL_CLASSES,
        label: await translate(chunter.string.SearchFilterAllClasses, {}, lang),
        icon: view.icon.Configure,
        exclusive: true
      },
      ...primaryItems
    ]

    if (restItems.length > 0) {
      restItems[0].separatorLabel = chunter.string.SearchFilterOtherClasses
      items.push(...restItems)
    }

    return items
  }

  let classItems: DropdownTextItem[] = []
  $: void buildClassItems($themeStore.language).then((items) => {
    classItems = items
  })

  $: pickedClasses = (filters.attachedToClasses ?? []) as Array<string>
  $: selectedClasses = pickedClasses.length > 0 ? pickedClasses : [ALL_CLASSES]
  $: selectedClassItems = classItems.filter((item) => selectedClasses.includes(`${item.id}`))

  function handleClassesSelected (selected: unknown): void {
    const raw = (Array.isArray(selected) ? selected : [selected]).map((id) => `${id}`)
    const ids = raw.filter((id) => id !== ALL_CLASSES)
    const objectClasses = ids.length > 0 ? (ids as Array<Ref<Class<Doc>>>) : undefined

    const kept = keepMatchingObjects(filters.attachedTo, objectClasses)

    update({ attachedToClasses: objectClasses, attachedTo: kept })
  }

  function keepMatchingObjects (
    objects: PickedObject[] | undefined,
    objectClasses: Array<Ref<Class<Doc>>> | undefined
  ): PickedObject[] | undefined {
    if (objects === undefined || objects.length === 0) return undefined
    if (objectClasses === undefined || objectClasses.length === 0) return objects

    const allowed = new Set(expandClasses(objectClasses))
    const kept = objects.filter((o) => allowed.has(o._class))
    return kept.length > 0 ? kept : undefined
  }

  $: pickedPersons = (filters.authors ?? []).map((a) => a.person)
  $: persons = pickedPersons.map((ref) => $employeeByIdStore.get(ref as Ref<Employee>)).filter(notEmpty)

  let memberRefs: Array<Ref<Person>> | undefined
  $: void loadMembers(space, $employeeRefByAccountUuidStore)

  async function loadMembers (
    space: Ref<Space> | undefined,
    byAccount: Map<AccountUuid, Ref<Employee>>
  ): Promise<void> {
    if (space === undefined) {
      memberRefs = undefined
      return
    }
    const found = await client.findOne(core.class.Space, { _id: space })
    memberRefs = found?.members.map((m) => byAccount.get(m)).filter(notEmpty)
  }

  function pickAuthors (ev: MouseEvent): void {
    showPopup(
      UsersPopup,
      {
        _class: contact.mixin.Employee,
        multiSelect: true,
        selectedUsers: pickedPersons,
        placeholder: chunter.string.SearchFilterAuthor,
        docQuery: memberRefs !== undefined ? { _id: { $in: memberRefs } } : undefined
      },
      ev.target as HTMLElement,
      undefined,
      (result: Array<Ref<Person>> | undefined) => {
        if (result != null) {
          handleAuthorsSelected(result)
        }
      }
    )
  }

  function handleAuthorsSelected (selected: Array<Ref<Person>>): void {
    if (selected.length === 0) {
      update({ authors: undefined })
      return
    }
    void resolveAuthors(selected).then((authors) => {
      update({ authors })
    })
  }

  let objectsButton: HTMLElement | undefined

  $: objects = filters.attachedTo ?? []

  function openObjects (): void {
    showPopup(
      SearchObjectPopup,
      { selected: objects, classes: expandClasses(filters.attachedToClasses ?? []) },
      objectsButton,
      () => {},
      (picked: PickedObject[] | undefined) => {
        if (picked !== undefined) {
          update({ attachedTo: picked.length > 0 ? picked : undefined })
        }
      }
    )
  }

  let optionsButton: HTMLElement | undefined

  $: objectsIcon = objects.length === 1 ? (objects[0].icon ?? chunter.icon.Hashtag) : chunter.icon.Hashtag

  $: activeOptions = [filters.hasAttachment === true, filters.includeTranscription === true].filter(Boolean).length

  function openOptions (): void {
    showPopup(
      SearchOptionsPopup,
      { filters },
      optionsButton,
      () => {},
      (patch: Partial<ChatSearchFilters> | undefined) => {
        if (patch !== undefined) {
          update(patch)
        }
      }
    )
  }

  function pickDate (): void {
    showPopup(
      RangeDatePopup,
      {
        startDate: filters.after !== undefined ? new Date(filters.after) : null,
        endDate: filters.before !== undefined ? new Date(filters.before) : null,
        label: chunter.string.SearchFilterDate
      },
      undefined,
      (result: { startDate?: Date | null, endDate?: Date | null } | undefined) => {
        if (result === undefined) return
        const from = result.startDate ?? undefined
        const to = result.endDate ?? undefined
        if (from === undefined && to === undefined) {
          update({ after: undefined, before: undefined })
          return
        }
        const end = to ?? from
        update({
          after: from !== undefined ? startOfDay(from.getTime()) : undefined,
          before: end !== undefined ? endOfDay(end.getTime()) : undefined
        })
      }
    )
  }

  function formatDay (value: number, lang: string): string {
    return new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  let dateLabel = ''

  $: translateCB(chunter.string.SearchFilterDate, {}, $themeStore.language, (r) => (dateLabel = r))

  function formatRange (from: number | undefined, to: number | undefined, lang: string): string {
    if (from === undefined && to === undefined) return dateLabel
    if (from === undefined) return `… – ${formatDay(to as number, lang)}`
    if (to === undefined) return `${formatDay(from, lang)} – …`
    const start = formatDay(from, lang)
    const end = formatDay(to, lang)
    return start === end ? start : `${start} – ${end}`
  }

  $: dateText = formatRange(filters.after, filters.before, $themeStore.language)
</script>

{#if compact}
  <div class="compact-bar">
    <ModernButton
      icon={persons.length === 0 ? contact.icon.Person : undefined}
      kind={'tertiary'}
      size={'small'}
      iconSize="small"
      shape={persons.length === 0 ? 'round' : undefined}
      tooltip={{ label: chunter.string.SearchFilterAuthor }}
      on:click={pickAuthors}
    >
      {#if persons.length > 0}
        <span class="authors">
          {#if persons.length === 1}
            <Avatar person={persons[0]} name={persons[0].name} size={'tiny'} />
            <span class="overflow-label">{formatName(persons[0].name)}</span>
          {:else}
            <CombineAvatars _class={contact.mixin.Employee} items={pickedPersons} size={'tiny'} hideLimit />
            <span class="overflow-label">
              <Label label={contact.string.NumberMembers} params={{ count: persons.length }} />
            </span>
          {/if}
        </span>
      {/if}
    </ModernButton>
  </div>
{:else}
<div class="filter-bar-host">
  <div class="filter-bar">
  <ModernDropdownLabels
    items={classItems}
    selected={selectedClasses}
    iconSize="small"
    multiselect
    autoSelect={false}
    label={chunter.string.SearchFilterObjectClass}
    kind={'secondary'}
    size={'small'}
    categoryKind={'heading'}
    on:selected={(e) => {
      handleClassesSelected(e.detail)
    }}
  >
    <svelte:fragment slot="content">
      {#if selectedClassItems[0] !== undefined}
        <FilterButtonContent
          title={selectedClassItems[0].label}
          icon={selectedClassItems[0].icon}
          count={selectedClassItems.length}
        />
      {/if}
    </svelte:fragment>
  </ModernDropdownLabels>

  <ModernButton
    icon={persons.length === 0 ? contact.icon.Person : undefined}
    label={persons.length === 0 ? chunter.string.SearchFilterAuthor : undefined}
    kind={'secondary'}
    size={'small'}
    iconSize="small"
    on:click={pickAuthors}
  >
    {#if persons.length > 0}
      <span class="authors">
        {#if persons.length === 1}
          <Avatar person={persons[0]} name={persons[0].name} size={'tiny'} />
          <span class="overflow-label">{formatName(persons[0].name)}</span>
        {:else}
          <CombineAvatars _class={contact.mixin.Employee} items={pickedPersons} size={'tiny'} hideLimit />
          <span class="overflow-label">
            <Label label={contact.string.NumberMembers} params={{ count: persons.length }} />
          </span>
        {/if}
      </span>
    {/if}
  </ModernButton>

  <div bind:this={objectsButton}>
    <ModernButton
      icon={objectsIcon}
      label={objects.length === 0 ? chunter.string.SearchFilterObject : undefined}
      kind={'secondary'}
      size={'small'}
      iconSize="small"
      on:click={openObjects}
    >
      {#if objects.length > 0}
        <FilterButtonContent title={objects[0].title} count={objects.length} />
      {/if}
    </ModernButton>
  </div>

  <div class="filter">
    <ModernButton
      icon={IconCalendar}
      label={filters.after === undefined && filters.before === undefined ? chunter.string.SearchFilterDate : undefined}
      title={filters.after !== undefined || filters.before !== undefined ? dateText : undefined}
      kind={'secondary'}
      size={'small'}
      iconSize="small"
      on:click={pickDate}
    />
    {#if filters.after !== undefined || filters.before !== undefined}
      <ModernButton
        icon={IconClose}
        kind={'tertiary'}
        size={'small'}
        iconSize="small"
        tooltip={{ label: chunter.string.SearchFilterClear }}
        on:click={() => {
          update({ after: undefined, before: undefined })
        }}
      />
    {/if}
  </div>

  <div bind:this={optionsButton}>
    <ModernButton
      icon={IconAttachment}
      label={chunter.string.SearchFilterOptions}
      kind={'secondary'}
      size={'small'}
      iconSize="small"
      on:click={openOptions}
    >
      {#if activeOptions > 0}
        <span class="counter">{activeOptions}</span>
      {/if}
    </ModernButton>
  </div>

    {#if $$slots.trailing}
      <div class="trailing"><slot name="trailing" /></div>
    {/if}
  </div>
</div>
{/if}

<style lang="scss">
  .compact-bar {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    flex: 0 0 auto;
  }

  .compact-bar > :global(button) {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .compact-bar .authors {
    max-width: 7rem;
  }
  .trailing {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }

  @container filterBar (min-width: 660px) {
    .trailing {
      margin-left: auto;
    }
  }

  .filter-bar-host {
    container: filterBar / inline-size;
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
  }

  @container filterBar (max-width: 480px) {
    .filter-bar {
      padding: 0.5rem 0.75rem;
      gap: 0.25rem;
    }
  }

  .filter-bar > :global(*) {
    flex-shrink: 0;
  }

  .filter {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .authors {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .counter {
    color: var(--theme-darker-color);
    flex-shrink: 0;
  }
</style>
