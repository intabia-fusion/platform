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
  import contact from '@hcengineering/contact'
  import type { Class, Doc, DocumentQuery, FindOptions, Mixin, Ref, RefTo, Timestamp } from '@hcengineering/core'
  import { SortingOrder, getObjectValue } from '@hcengineering/core'
  import { ObjectPopup, createQuery, getClient, updateAttribute } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import {
    Chevron,
    Component,
    IconMoreV,
    IconSearch,
    Icon,
    Label,
    Loading,
    Timeline,
    showPopup
  } from '@hcengineering/ui'
  import type { AnyComponent, TimelineRow } from '@hcengineering/ui'
  import plugin from '../plugin'
  import type {
    AttributeModel,
    BuildModelKey,
    TimelineField,
    TimelineViewletProps,
    ViewOptionModel,
    ViewOptions,
    Viewlet
  } from '@hcengineering/view'
  import { showMenu } from '../actions'
  import { buildConfigLookup, buildModel, openDocInSidebar } from '../utils'
  import { timelineDayWidth, timelineMonthStore, timelineRangeStore } from '../timeline'
  import {
    assignLanes,
    distinctResources,
    dropChange,
    getRank,
    getWindow,
    groupByOwner,
    groupDocsBy,
    groupWrites,
    inWindow,
    mergeResults,
    placeholderValues,
    resourceMove,
    sortField,
    toField,
    windowCollector,
    windowConditions,
    type MoveRow,
    type Window
  } from '../timelineRows'
  import { getResultQuery } from '../viewOptions'
  import ListPresenter from './list/ListPresenter.svelte'
  import ObjectPresenter from './ObjectPresenter.svelte'

  export let _class: Ref<Class<Doc>>
  export let query: DocumentQuery<Doc> = {}
  export let options: FindOptions<Doc> | undefined = undefined
  export let viewlet: Viewlet
  // Timeline has no view settings; a stored preference config must not replace the model one.
  export let config: Array<BuildModelKey | string> | undefined = undefined
  export let viewOptions: ViewOptions | undefined = undefined
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let range: { startDate: Timestamp, targetDate: Timestamp } | undefined = undefined
  // Grid scale in months when the view is not windowed (the window picks its own).
  export let scaleMonths: number | undefined = undefined

  interface Line {
    doc: Doc
    // Group header: `doc` is the referenced doc, the row has no bar.
    group?: string
    // Key in `collapsed` when the row can be folded.
    fold?: string
    child: boolean
    start: TimelineField
    end: TimelineField
    rankField?: string
    presenter?: AnyComponent
    labelPresenter?: AnyComponent
    model: AttributeModel[]
    // Resource row: `doc` is the person, all these docs are bars of this one row (`lane` by index).
    resource?: Doc[]
    lane?: number[]
    unassigned?: boolean
    // Empty resource row shown only while a bar is dragged
    placeholder?: boolean
    // Drop target that asks for the value in a popup
    pick?: boolean
    // Parent doc id of a child row; groupBy value of the root row (of the parent for child rows).
    parent?: string
    groupValue?: string
  }

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const docsQuery = createQuery()
  const childrenQuery = createQuery()
  const groupsQuery = createQuery()
  const personsQuery = createQuery()
  // One live query per windowed condition; covers an end chain of up to three fields.
  const windowQueries = [createQuery(), createQuery(), createQuery(), createQuery()]

  let timeline: Timeline
  let collapsed = new Set<string>()
  let groupDocs = new Map<string, Doc>()
  let personDocs = new Map<string, Doc>()
  let dragging = false
  // Parent of the dragged bar's row: placeholders appear only in its group, so other groups do not shift
  let dragParent: string | undefined
  let candidates: Doc[] = []
  // buildRows reads `placeholders` through the closure; the argument only makes `rows` track it.
  $: placeholders = dragging ? candidates : []

  let docs: Doc[] = []
  let childDocs: Doc[] = []
  let loading = true
  let childrenLoading = true
  let rootModel: AttributeModel[] = []
  let childModel: AttributeModel[] = []

  $: props = viewlet.props as TimelineViewletProps
  $: startField = toField(props.startField)
  $: endField = toField(props.endField)
  $: children = props.children
  $: childStart = children !== undefined ? toField(children.startField) : undefined
  $: childEnd = children !== undefined ? toField(children.endField) : undefined
  $: rootConfig = viewlet.config
  // `timelineRows` names a Ref attribute: one row per its value replaces the child rows, or the rows without children.
  $: resourceField =
    typeof viewOptions?.timelineRows === 'string' && viewOptions.timelineRows !== 'parent'
      ? viewOptions.timelineRows
      : undefined
  $: resourceClass = children?._class ?? _class
  $: personClass =
    resourceField !== undefined
      ? (hierarchy.findAttribute(resourceClass, resourceField)?.type as RefTo<Doc> | undefined)?.to
      : undefined
  $: resourceMode = personClass !== undefined
  $: resourceIds = resourceMode ? distinctResources(children !== undefined ? childDocs : docs, resourceField) : []
  $: subscribePersons(personClass, resourceIds)

  $: void buildModel({ client, _class, keys: rootConfig }).then((res) => {
    rootModel = res
  })
  $: if (children?.config !== undefined) {
    void buildModel({ client, _class: children._class, keys: children.config }).then((res) => {
      childModel = res
    })
  }

  $: sort = { [sortField(props.rankField, startField)]: SortingOrder.Ascending }
  // Rows are loaded for at least three months so a one-month view still shows its neighbours on scroll.
  $: window = props.windowed === true ? getWindow($timelineMonthStore, Math.max(3, $timelineRangeStore)) : undefined
  $: shownWindow = props.windowed === true ? getWindow($timelineMonthStore, $timelineRangeStore) : undefined
  $: dayWidth =
    props.windowed === true
      ? timelineDayWidth($timelineRangeStore)
      : scaleMonths !== undefined
        ? timelineDayWidth(scaleMonths)
        : undefined
  // Scroll once per timeline instance and start date, not on every re-render of the host.
  let scrolled: { timeline: Timeline, start: Timestamp } | undefined
  $: if (timeline !== undefined) {
    const start = shownWindow?.from ?? range?.startDate
    if (start !== undefined && (scrolled?.timeline !== timeline || scrolled.start !== start)) {
      scrolled = { timeline, start }
      timeline.scrollToDate(start)
    }
  }
  $: void getResultQuery(hierarchy, query, viewOptionsConfig ?? viewlet.viewOptions?.other, viewOptions).then(
    (resultQuery) => {
      subscribe(resultQuery, window, {
        sort,
        lookup: buildConfigLookup(hierarchy, _class, rootConfig),
        ...options
      })
    }
  )

  // Outside the reactive block: callbacks read query results, which must not re-trigger the subscription.
  function subscribe (resultQuery: DocumentQuery<Doc>, window: Window | undefined, findOptions: FindOptions<Doc>): void {
    if (window === undefined) {
      windowQueries.forEach((it) => {
        it.unsubscribe()
      })
      docsQuery.query(
        _class,
        resultQuery,
        (res) => {
          docs = res
          loading = false
        },
        findOptions
      )
      return
    }
    docsQuery.unsubscribe()
    const conditions = windowConditions(window, startField, endField)
    const answer = windowCollector(
      conditions.length,
      (results) => mergeResults(results, props.rankField, (doc) => getDate(doc, startField)),
      (merged) => {
        docs = merged
        loading = false
      }
    )
    windowQueries.forEach((it, i) => {
      const condition = conditions[i]
      if (condition === undefined) {
        it.unsubscribe()
        return
      }
      it.query(
        _class,
        { ...resultQuery, ...condition },
        (res) => {
          answer(i, res)
        },
        findOptions
      )
    })
  }

  // Outside the reactive block for the same reason as `subscribe`.
  function subscribePersons (personClass: Ref<Class<Doc>> | undefined, ids: Array<Ref<Doc>>): void {
    if (personClass === undefined) {
      personsQuery.unsubscribe()
      return
    }
    personsQuery.query(personClass, { _id: { $in: ids } }, (res) => {
      personDocs = new Map(res.map((it) => [it._id, it]))
    })
  }

  $: if (children !== undefined) {
    childrenQuery.query(
      children._class,
      { [children.parentField]: { $in: docs.map((it) => it._id) } },
      (res) => {
        childDocs = res
        childrenLoading = false
      },
      { lookup: buildConfigLookup(hierarchy, children._class, children.config ?? []) }
    )
  } else {
    childrenQuery.unsubscribe()
    childDocs = []
    childrenLoading = false
  }

  // The field that holds the value, following fallbacks; the last one in the chain when all are empty.
  function resolve (doc: Doc, field: TimelineField): { field: TimelineField, value: Timestamp | undefined } {
    const hasMixin = field.mixin === undefined || hierarchy.hasMixin(doc, field.mixin)
    const source = field.mixin !== undefined && hasMixin ? hierarchy.as(doc, field.mixin) : doc
    const value = hasMixin ? (source as unknown as Record<string, Timestamp | null | undefined>)[field.key] : undefined
    if (value != null || field.fallback === undefined) return { field, value: value ?? undefined }
    return resolve(doc, toField(field.fallback))
  }

  const getDate = (doc: Doc, field: TimelineField): Timestamp | undefined => resolve(doc, field).value

  // `persons` set: one row per `resourceField` value of the parent's children instead of one row per child.
  function childLines (
    parent: Doc,
    childDocs: Doc[],
    childModel: AttributeModel[],
    persons: Map<string, Doc> | undefined,
    groupValue: string | undefined
  ): Line[] {
    if (children === undefined || childStart === undefined || childEnd === undefined) return []
    const start = childStart
    const end = childEnd
    const { parentField, presenter, labelPresenter, rankField } = children
    const scheduled = childDocs
      .filter((it) => (it as unknown as Record<string, unknown>)[parentField] === parent._id)
      .filter((it) => getDate(it, start) !== undefined)
    const sorted =
      rankField !== undefined
        ? scheduled.sort((a, b) => getRank(a, rankField).localeCompare(getRank(b, rankField)))
        : scheduled.sort((a, b) => (getDate(a, start) ?? 0) - (getDate(b, start) ?? 0))
    if (persons !== undefined) {
      return resourceLines(
        sorted,
        persons,
        {
          child: true,
          start,
          end,
          presenter,
          model: [],
          parent: parent._id,
          groupValue
        },
        parent
      )
    }
    return sorted.map((doc) => ({
      doc,
      child: true,
      start,
      end,
      rankField,
      presenter,
      labelPresenter,
      model: childModel,
      parent: parent._id,
      groupValue
    }))
  }

  $: groupAttr = props.groupBy !== undefined ? hierarchy.findAttribute(_class, props.groupBy) : undefined
  $: groupClass = (groupAttr?.type as RefTo<Doc> | undefined)?.to
  $: if (props.groupBy !== undefined && groupClass !== undefined) {
    groupsQuery.query(groupClass, { _id: { $in: distinctResources(docs, props.groupBy) } }, (res) => {
      groupDocs = new Map(res.map((it) => [it._id, it]))
    })
  } else {
    groupsQuery.unsubscribe()
  }

  function docLines (
    doc: Doc,
    childDocs: Doc[],
    childModel: AttributeModel[],
    collapsed: Set<string>,
    persons: Map<string, Doc> | undefined,
    rootModel: AttributeModel[],
    groupValue?: string
  ): Line[] {
    const kids = childLines(doc, childDocs, childModel, persons, groupValue)
    const line: Line = {
      doc,
      fold: kids.length > 0 ? doc._id : undefined,
      child: false,
      start: startField,
      end: endField,
      rankField: props.rankField,
      presenter: props.presenter,
      labelPresenter: props.labelPresenter,
      model: rootModel,
      groupValue
    }
    return [line, ...(collapsed.has(doc._id) ? [] : kids)]
  }

  function buildRows (
    docs: Doc[],
    childDocs: Doc[],
    childModel: AttributeModel[],
    groupDocs: Map<string, Doc>,
    collapsed: Set<string>,
    window: Window | undefined,
    persons: Map<string, Doc> | undefined,
    rootModel: AttributeModel[],
    _placeholders: Doc[]
  ): Line[] {
    const visible = docs
      .filter((doc) => props.onlyScheduled !== true || isScheduled(doc))
      .filter((doc) => inWindow(getDate(doc, startField), getDate(doc, endField), window))
    if (persons !== undefined && children === undefined) {
      const scheduled = visible.filter((doc) => getDate(doc, startField) !== undefined)
      const base = { child: false, start: startField, end: endField, presenter: props.presenter, model: [] }
      return resourceLines(scheduled, persons, base)
    }
    const toLines = (doc: Doc, groupValue?: string): Line[] =>
      docLines(doc, childDocs, childModel, collapsed, persons, rootModel, groupValue)
    const key = props.groupBy
    if (key === undefined) return visible.flatMap((doc) => toLines(doc))
    const groups = groupDocsBy(visible, key)
    if (groups.size < 2) return visible.flatMap((doc) => toLines(doc))
    return Array.from(groups.entries()).flatMap(([group, items]): Line[] => [
      {
        doc: groupDocs.get(group) ?? items[0],
        group,
        fold: group,
        child: false,
        start: startField,
        end: endField,
        model: []
      },
      ...(collapsed.has(group) ? [] : items.flatMap((doc) => toLines(doc, group)))
    ])
  }

  function resourceLine (base: Line, issues: Doc[]): Line {
    const { sorted, lane } = assignLanes(
      issues,
      (doc) => getDate(doc, base.start),
      (doc) => getDate(doc, base.end)
    )
    return { ...base, resource: sorted, lane }
  }

  // Rows in order of the first child of each assignee, the unassigned row last, then drag placeholders.
  function resourceLines (kids: Doc[], persons: Map<string, Doc>, base: Omit<Line, 'doc'>, owner?: Doc): Line[] {
    const field = resourceField
    if (field === undefined) return []
    const stub = { _id: '' as Ref<Doc>, _class: resourceClass } as unknown as Doc
    const { assigned, free } = groupByOwner(kids, field)
    const isPerson = personClass !== undefined && hierarchy.isDerived(personClass, contact.class.Person)
    const spaces = new Set([...kids, ...(owner !== undefined ? [owner] : [])].map((it) => it.space))
    const active = dragging && (dragParent === undefined || owner?._id === dragParent)
    const scoped = active ? placeholders.filter((it) => isPerson || spaces.has(it.space)) : []
    const extra = placeholderValues(
      scoped,
      assigned.map(([id]) => id),
      3
    ).map((doc): Line => ({ ...base, doc, resource: [], lane: [], placeholder: true }))
    const none: Line[] =
      active && free === undefined
        ? [{ ...base, doc: stub, resource: [], lane: [], unassigned: true, placeholder: true }]
        : []
    const pick: Line[] = active ? [{ ...base, doc: stub, resource: [], lane: [], placeholder: true, pick: true }] : []
    return [
      ...assigned.flatMap(([id, items]): Line[] => {
        const doc = persons.get(id)
        return doc !== undefined ? [resourceLine({ ...base, doc }, items)] : []
      }),
      ...(free !== undefined ? [resourceLine({ ...base, doc: stub, unassigned: true }, free)] : []),
      ...(resourceMode ? [...none, ...extra, ...pick] : [])
    ]
  }

  function toggle (key: string): void {
    if (collapsed.has(key)) collapsed.delete(key)
    else collapsed.add(key)
    collapsed = collapsed
  }

  $: rows = buildRows(
    docs,
    childDocs,
    childModel,
    groupDocs,
    collapsed,
    window,
    resourceMode ? personDocs : undefined,
    rootModel,
    placeholders
  )

  $: lines = rows.map((line): TimelineRow => {
    if (line.group !== undefined) return { items: undefined }
    const content = (doc: Doc): Record<string, any> =>
      line.presenter !== undefined
        ? { presenter: Component, props: { is: line.presenter, props: { value: doc, viewOptions } } }
        : {}
    if (line.resource !== undefined) {
      const lane = line.lane ?? []
      const items = line.resource.map((doc, i) => ({
        key: doc._id,
        startDate: getDate(doc, line.start) ?? 0,
        targetDate: getDate(doc, line.end),
        lane: lane[i],
        ...content(doc)
      }))
      const lanes = Math.max(1, ...lane.map((it) => it + 1))
      return {
        items: items.length > 0 ? items : undefined,
        compact: true,
        lanes,
        droppable: true,
        key: `${line.parent ?? ''}/${line.groupValue ?? ''}/${line.doc._id}`
      }
    }
    const start = getDate(line.doc, line.start)
    const end = getDate(line.doc, line.end)
    const compact = line.child
    if (start !== undefined) { return { items: [{ key: line.doc._id, startDate: start, targetDate: end, ...content(line.doc) }], compact } }
    // No start: show a one-day marker at the end date
    if (end !== undefined) { return { items: [{ key: line.doc._id, startDate: end, targetDate: end, ...content(line.doc) }], compact } }
    return { items: undefined, compact }
  })

  async function write (
    doc: Doc,
    changes: Array<{ field: TimelineField, value: Timestamp }>,
    extra: Record<string, any> = {}
  ): Promise<void> {
    const { attrs, mixins } = groupWrites(
      changes.map(({ field, value }) => ({ field: resolve(doc, field).field, value }))
    )
    const all = { ...attrs, ...extra }
    try {
      if (Object.keys(all).length > 0) await client.update(doc, all)
      for (const [mixin, values] of mixins) {
        await client.updateMixin(doc._id, doc._class, doc.space, mixin as Ref<Mixin<Doc>>, values)
      }
    } catch (err) {
      console.error(`Timeline: failed to update ${doc._id}: ${String(err)}`)
    }
  }

  async function onChange (
    e: CustomEvent<{
      row: number
      index: number
      startDate: Timestamp
      targetDate: Timestamp | undefined
      targetRow?: number
    }>
  ): Promise<void> {
    const line = rows[e.detail.row]
    if (line === undefined || line.group !== undefined) return
    const doc = line.resource !== undefined ? line.resource[e.detail.index] : line.doc
    if (doc === undefined) return
    const { startDate, targetDate } = e.detail
    const oldStart = getDate(doc, line.start)
    const oldEnd = getDate(doc, line.end)
    // Doc with only an end date has a synthetic start equal to the end
    const startChanged = oldStart !== undefined ? startDate !== oldStart : startDate !== targetDate
    const changes = []
    if (startChanged) changes.push({ field: line.start, value: startDate })
    if (targetDate !== undefined && targetDate !== oldEnd) changes.push({ field: line.end, value: targetDate })
    const dropped = e.detail.targetRow !== undefined ? rows[e.detail.targetRow] : undefined
    const target = dropped?.pick === true ? await pickTarget(dropped) : dropped
    if (dropped?.pick === true && target === undefined) return
    const moved =
      target !== undefined && resourceField !== undefined
        ? resourceMove(toMove(line), toMove(target), {
            resourceField,
            parentField: children?.parentField,
            groupBy: props.groupBy
          })
        : undefined
    if (changes.length > 0 || moved !== undefined) await write(doc, changes, moved)
  }

  const toMove = (line: Line): MoveRow => ({
    doc: line.doc,
    resource: line.resource !== undefined,
    unassigned: line.unassigned,
    parent: line.parent,
    groupValue: line.groupValue
  })

  function onOpen (e: CustomEvent<{ row: number, index: number }>): void {
    const line = rows[e.detail.row]
    if (line === undefined || line.group !== undefined) return
    const doc = line.resource !== undefined ? line.resource[e.detail.index] : line.doc
    if (doc !== undefined) void openDocInSidebar(doc)
  }

  function onContextMenu (e: CustomEvent<{ row: number, index: number, event: MouseEvent }>): void {
    const line = rows[e.detail.row]
    if (line === undefined || line.group !== undefined) return
    const doc = line.resource !== undefined ? line.resource[e.detail.index] : line.doc
    if (doc !== undefined) showMenu(e.detail.event, { object: doc })
  }

  async function onAdd (e: CustomEvent<{ row: number, date: Timestamp }>): Promise<void> {
    const line = rows[e.detail.row]
    if (line === undefined || line.group !== undefined || line.resource !== undefined) return
    await write(line.doc, [
      { field: line.start, value: e.detail.date },
      { field: line.end, value: e.detail.date }
    ])
  }

  function getOnChange (doc: Doc, model: AttributeModel): ((value: any) => void) | undefined {
    const attr = model.attribute
    if (attr === undefined || attr.readonly === true || model.collectionAttr || model.isLookup) return
    return (value: any) => {
      void updateAttribute(client, doc, doc._class, { key: model.key, attr }, value)
    }
  }

  const isScheduled = (doc: Doc): boolean =>
    getDate(doc, startField) !== undefined || getDate(doc, endField) !== undefined

  // Full list for the "select" drop row; persons are active employees.
  async function pickTarget (row: Line): Promise<Line | undefined> {
    if (personClass === undefined) return
    const isPerson = hierarchy.isDerived(personClass, contact.class.Person)
    const spaces = Array.from(new Set((children !== undefined ? childDocs : docs).map((it) => it.space)))
    return await new Promise((resolve) => {
      showPopup(
        ObjectPopup,
        {
          _class: isPerson ? contact.mixin.Employee : personClass,
          docQuery: isPerson ? { active: true } : { space: { $in: spaces } },
          // ponytail: person name or label of milestone/component; a per-class search field when other classes appear
          searchField: isPerson ? 'name' : 'label',
          type: 'presenter'
        },
        'top',
        (res: Doc | undefined) => {
          resolve(res != null ? { ...row, doc: res, pick: false, placeholder: false } : undefined)
        }
      )
    })
  }

  // Candidates are loaded once per drag; the persons class lists active employees only.
  function onDragStart (e: CustomEvent<{ row: number, index: number }>): void {
    // Only bars of resource rows can change their category
    if (rows[e.detail.row]?.resource === undefined) return
    dragParent = rows[e.detail.row]?.parent
    dragging = true
    if (personClass === undefined) return
    const spaces = Array.from(new Set((children !== undefined ? childDocs : docs).map((it) => it.space)))
    const isPerson = hierarchy.isDerived(personClass, contact.class.Person)
    const load = isPerson
      ? client.findAll(contact.mixin.Employee, { active: true }, { limit: 50 })
      : client.findAll(personClass, { space: { $in: spaces } }, { limit: 50 })
    void load.then((res) => {
      candidates = res
    })
  }

  let dragged: number | undefined

  // Drops the dragged row before `target`; a child row may also move under another parent.
  async function onDrop (target: number): Promise<void> {
    const from = dragged === undefined ? undefined : rows[dragged]
    dragged = undefined
    const to = rows[target]
    if (from === undefined || to === undefined) return
    const change = dropChange(rows, from, to, { parentField: children?.parentField, groupBy: props.groupBy })
    if (change === undefined || from.rankField === undefined) return
    const { prev, next } = change.rank
    const rank = makeRank(
      prev !== undefined ? getRank(prev.doc, from.rankField) : undefined,
      next !== undefined ? getRank(next.doc, from.rankField) : undefined
    )
    await client.update(from.doc, { ...change.updates, [from.rankField]: rank })
  }
</script>

{#if loading || childrenLoading}
  <Loading />
{:else}
  {#key `${_class}-${dayWidth}`}
    <Timeline
      bind:this={timeline}
      {lines}
      range={shownWindow !== undefined ? { startDate: shownWindow.from, targetDate: shownWindow.to } : range}
      dayWidth={dayWidth ?? 5}
      editable
      on:item-change={onChange}
      on:drag-start={onDragStart}
      on:drag-end={() => {
        dragging = false
      }}
      on:row-add={onAdd}
      on:item-contextmenu={onContextMenu}
      on:item-open={onOpen}
      let:row
    >
      {@const line = rows[row]}
      {#if line !== undefined}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="flex-row-center flex-gap-2 w-full min-w-0"
          class:child={line.child}
          class:group={line.group !== undefined}
          class:placeholder={line.placeholder}
          on:dragover|preventDefault
          on:drop|preventDefault={() => {
            void onDrop(row)
          }}
          on:contextmenu={(event) => {
            if (line.unassigned !== true) showMenu(event, { object: line.doc })
          }}
        >
          {#if line.rankField !== undefined && line.group === undefined}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="handle"
              draggable={true}
              on:dragstart={(event) => {
                dragged = row
                const rowEl = event.currentTarget.parentElement
                if (rowEl !== null) event.dataTransfer?.setDragImage(rowEl, 0, 0)
              }}
            >
              <IconMoreV size={'small'} />
            </div>
          {/if}
          {#if line.fold !== undefined}
            {@const fold = line.fold}
            <button
              class="fold"
              on:click|stopPropagation={() => {
                toggle(fold)
              }}
            >
              <Chevron size={'small'} expanded={!collapsed.has(fold)} />
            </button>
          {:else if !line.child}
            <div class="fold" />
          {/if}
          {#if line.pick === true}
            <Icon icon={IconSearch} size={'small'} />
            <Label label={plugin.string.Select} />
          {:else if line.unassigned === true}
            <Label label={plugin.string.NotSpecified} />
          {:else if line.group !== undefined || line.resource !== undefined}
            <ObjectPresenter value={line.doc} />
          {:else if line.model.length > 0}
            {#each line.model as attributeModel, i}
              {#if attributeModel.displayProps?.grow === true}
                <div class="flex-grow" />
              {:else}
                <ListPresenter
                  docObject={line.doc}
                  {attributeModel}
                  props={{}}
                  value={getObjectValue(attributeModel.key, line.doc)}
                  onChange={getOnChange(line.doc, attributeModel)}
                  hideDivider={i === 0}
                />
              {/if}
            {/each}
          {:else if line.labelPresenter !== undefined}
            <Component is={line.labelPresenter} props={{ value: line.doc }} />
          {:else}
            <ObjectPresenter value={line.doc} />
          {/if}
          {#if props.unscheduledAction !== undefined && !line.child && line.group === undefined && line.resource === undefined && lines[row]?.items === undefined}
            <div class="flex-grow" />
            <Component is={props.unscheduledAction} props={{ value: line.doc }} />
          {/if}
          {#if !line.child && line.group === undefined && line.resource === undefined && children?.addComponent !== undefined}
            <div class="flex-grow" />
            <Component is={children.addComponent} props={{ parent: line.doc }} />
          {/if}
        </div>
      {/if}
    </Timeline>
  {/key}
{/if}

<style lang="scss">
  .child {
    padding-left: 1.5rem;
  }
  .handle {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    align-self: stretch;
    padding-right: 0.25rem;
    border-right: 1px solid var(--theme-divider-color);
    cursor: grab;
  }
  .group {
    font-weight: 500;
  }
  .placeholder {
    opacity: 0.5;
    border-top: 1px dashed var(--theme-divider-color);
  }
  .fold {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
  }
</style>
