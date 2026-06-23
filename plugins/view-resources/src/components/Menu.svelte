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
  import { Class, Doc, Ref } from '@hcengineering/core'
  import { Asset, getMetadata } from '@hcengineering/platform'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { Action, Menu } from '@hcengineering/ui'
  import { Action as ViewAction, ViewContextType } from '@hcengineering/view'
  import { actionGroupOrder, getActions, invokeAction } from '../actions'

  export let object: Doc | Doc[]
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let actions: Action[] = []
  export let excludedActions: string[] = []
  export let includedActions: string[] = []
  export let mode: ViewContextType | undefined = undefined
  export let overrides = new Map<Ref<ViewAction>, (object: Doc | Doc[], ev?: Event) => void>()

  let resActions = actions

  let loaded = false

  void getActions(getClient(), object, baseMenuClass, mode).then((result) => {
    const disabledFeatures = getMetadata(presentation.metadata.DisabledFeatures)

    const filtered = result.filter((a) => {
      if (a.feature !== undefined && disabledFeatures?.has(a.feature) === true) {
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
      label: a.label,
      icon: a.icon as Asset,
      inline: a.inline,
      group: a.context.group ?? 'other',
      order: a.context.order,
      action: async (_: any, evt: Event) => {
        if (overrides?.has(a._id)) {
          overrides.get(a._id)?.(object, evt)
          return
        }
        invokeAction(object, evt, a)
      },
      component: a.actionPopup,
      props: { ...a.actionProps, value: object }
    }))

    resActions = [...newActions, ...actions].sort((a, b) => {
      const groupA = (actionGroupOrder as any)[a.group ?? 'other']
      const groupB = (actionGroupOrder as any)[b.group ?? 'other']

      if (groupA !== groupB) {
        return groupA - groupB
      }

      const orderA = a.order ?? 99999
      const orderB = b.order ?? 99999

      return orderA - orderB
    })
    if (resActions.length > 0) {
      loaded = true
    }
  })
</script>

{#if loaded}
  <Menu actions={resActions} on:close on:changeContent />
{/if}
