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
  import type { AnyAttribute, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { stripAttributeFromRules, type ScreenTab, type Workflow } from '@hcengineering/workflow'

  import { navigateToScreen, navigateToWorkflow } from '../location'
  import plugin from '../plugin'
  import type { UsedInItem } from '../types'
  import UsedInList from './UsedInList.svelte'

  export let attribute: AnyAttribute

  const client = getClient()

  let screens: UsedInItem[] = []
  let workflows: UsedInItem[] = []

  $: void load(attribute)

  async function load (attribute: AnyAttribute): Promise<void> {
    const [screenItems, workflowItems] = await Promise.all([loadScreens(attribute), loadWorkflows(attribute)])
    screens = screenItems
    workflows = workflowItems
  }

  async function loadScreens (attribute: AnyAttribute): Promise<UsedInItem[]> {
    const fields = await client.findAll(plugin.class.ScreenField, { attribute: attribute._id })
    if (fields.length === 0) return []
    const tabIds = [...new Set(fields.map((f) => f.attachedTo))]
    const tabs = await client.findAll(plugin.class.ScreenTab, { _id: { $in: tabIds } })
    const screenIds = [...new Set(tabs.map((t: ScreenTab) => t.attachedTo))]
    const found = await client.findAll(plugin.class.Screen, { _id: { $in: screenIds } })
    return found
      .map((screen) => ({
        id: screen._id,
        name: screen.name,
        onClick: () => {
          navigateToScreen(screen._id, true, screen.projectType)
        }
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function loadWorkflows (attribute: AnyAttribute): Promise<UsedInItem[]> {
    const attributes = new Set([attribute._id])
    const transitions = await client.findAll(plugin.class.WorkflowTransition, {})
    const transitionNames = new Map<Ref<Workflow>, string[]>()
    for (const t of transitions) {
      const affected =
        stripAttributeFromRules(t.validators, attributes) !== undefined ||
        stripAttributeFromRules(t.postFunctions, attributes) !== undefined
      if (!affected) continue
      transitionNames.set(t.attachedTo, [...(transitionNames.get(t.attachedTo) ?? []), t.name])
    }
    if (transitionNames.size === 0) return []
    const found = await client.findAll(plugin.class.Workflow, { _id: { $in: [...transitionNames.keys()] } })
    return found
      .map((wf) => ({
        id: wf._id,
        name: wf.name,
        details: (transitionNames.get(wf._id) ?? []).join(', '),
        onClick: () => {
          navigateToWorkflow(wf._id, true, wf.projectType)
        }
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
</script>

<UsedInList headerLabel={plugin.string.AttributeRemovedFromScreens} icon={plugin.icon.Screen} items={screens} />
<UsedInList
  headerLabel={plugin.string.AttributeRulesChangedInWorkflows}
  icon={plugin.icon.Workflow}
  items={workflows}
/>
