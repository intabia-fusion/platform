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
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import type { Asset } from '@hcengineering/platform'
  import { getClient, isDisabled } from '@hcengineering/presentation'
  import type { Action } from '@hcengineering/ui'
  import { Menu } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import type { ActionMenuLayout, Action as ViewAction, ViewContextType } from '@hcengineering/view'
  import { actionGroupOrder, getActions, invokeAction } from '../actions'
  import ActionsSubmenu from './ActionsSubmenu.svelte'

  export let object: Doc | Doc[]
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let actions: Action[] = []
  export let excludedActions: string[] = []
  export let includedActions: string[] = []
  export let mode: ViewContextType | undefined = undefined
  export let overrides = new Map<Ref<ViewAction>, (object: Doc | Doc[], ev?: Event) => void>()
  // Overrides the layout of the object's class (view.mixin.ActionMenu)
  export let layout: ActionMenuLayout = {}
  // Adds the header buttons of a narrow panel as the first group
  export let withHeaderActions = false

  let resActions = actions
  let loaded = false

  const client = getClient()
  void Promise.all([
    getActions(client, object, baseMenuClass, mode),
    withHeaderActions ? getActions(client, object, baseMenuClass, 'header') : []
  ]).then(([contextActions, headerActions]) => {
    const headerIds = new Set(headerActions.map((a) => a._id))
    const result = [...headerActions, ...contextActions]
    const filtered = result.filter((a) => {
      if (isDisabled(a.feature)) {
        return false
      }

      if (excludedActions.includes(a._id)) {
        return false
      }

      if (includedActions.length > 0 && !includedActions.includes(a._id)) {
        return false
      }

      if (a.override && a.override.filter((o) => excludedActions.includes(o)).length > 0) {
        return false
      }

      return true
    })

    const newActions: Action[] = filtered.map((a) => ({
      id: a._id,
      label: a.label,
      icon: a.icon as Asset,
      inline: a.inline,
      group: headerIds.has(a._id) ? 'header' : (a.context.group ?? 'other'),
      order: a.context.order,
      action: async (_: any, evt: Event) => {
        if (overrides?.has(a._id)) {
          overrides.get(a._id)?.(object, evt)
          return
        }
        void invokeAction(object, evt, a)
      },
      component: a.actionPopup,
      props: { ...a.actionProps, value: object }
    }))

    const sorted = [...newActions, ...actions].sort((a, b) => {
      const groupA = groupOrder(a.group)
      const groupB = groupOrder(b.group)

      if (groupA !== groupB) {
        return groupA - groupB
      }

      const orderA = a.order ?? 99999
      const orderB = b.order ?? 99999

      return orderA - orderB
    })
    resActions = arrange(sorted, newActions, Object.keys(layout).length > 0 ? layout : classLayout())
    if (resActions.length > 0) {
      loaded = true
    }
  })

  function groupOrder (group: string | undefined): number {
    if (group === 'header') return 0
    return (actionGroupOrder as any)[group ?? 'other'] ?? actionGroupOrder.other
  }

  function classLayout (): ActionMenuLayout {
    const _class = baseMenuClass ?? (Array.isArray(object) ? object[0]?._class : object._class)
    if (_class === undefined) return {}
    return client.getHierarchy().classHierarchyMixin(_class, view.mixin.ActionMenu)?.layout ?? {}
  }

  function arrange (sorted: Action[], viewActions: Action[], layout: ActionMenuLayout): Action[] {
    const placed = new Map<string, Action[]>()
    const used = new Set<Action>()
    const find = (id: string): Action | undefined => viewActions.find((it) => it.id === id)
    for (const [group, items] of Object.entries(layout)) {
      const list: Action[] = []
      for (const item of items ?? []) {
        const sub = (typeof item === 'string' ? [item] : item.items)
          .map(find)
          .filter((it): it is Action => it !== undefined)
        sub.forEach((it) => used.add(it))
        if (typeof item === 'string' || sub.length === 1) {
          list.push(...sub.map((it) => ({ ...it, group })))
        } else if (sub.length > 1) {
          list.push({
            label: item.label,
            icon: item.icon,
            group,
            action: async () => {},
            component: ActionsSubmenu,
            props: { actions: sub }
          })
        }
      }
      placed.set(group, list)
    }
    const rest = sorted.filter((it) => !used.has(it))
    const groups = [...new Set([...placed.keys(), ...rest.map((it) => it.group ?? 'other')])].sort(
      (a, b) => groupOrder(a) - groupOrder(b)
    )
    return groups.flatMap((group) => [
      ...(placed.get(group) ?? []),
      ...rest.filter((it) => (it.group ?? 'other') === group)
    ])
  }
</script>

{#if loaded}
  <Menu actions={resActions} on:close on:changeContent />
{/if}
