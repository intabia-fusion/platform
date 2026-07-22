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
  import { createEventDispatcher } from 'svelte'
  import { notEmpty, Ref, Status } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui, { ListItem, ModernDropdown } from '@hcengineering/ui'
  import { WorkflowTransition } from '@hcengineering/workflow'

  import TransitionPresenter from './TransitionPresenter.svelte'

  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let selected: Ref<WorkflowTransition> | undefined = undefined

  const dispatch = createEventDispatcher<{ select: Ref<WorkflowTransition> }>()

  $: transitionItems = (transitions ?? []).map(
    (t): ListItem => ({
      _id: t._id,
      label: t.name,
      component: TransitionPresenter,
      componentProps: { transition: t, statuses }
    })
  )

  $: selectedTransitionItem = transitionItems.find((it) => it._id === selected) ?? transitionItems[0]
  $: transitionTooltip = getTransitionTooltipText(selectedTransitionItem)

  function getTransitionTooltipText (item: ListItem | undefined): string | undefined {
    if (item == null) return undefined
    const transitionObj = transitions.find((it) => it._id === item?._id) ?? undefined
    if (transitionObj == null) return undefined

    const fromStatuses = (transitionObj?.from ?? [])
      .map((id) => (statuses ?? []).find((s) => s._id === id))
      .filter(notEmpty)

    const toStatus = (statuses ?? []).find((s) => s._id === transitionObj?.to)

    const fromNamesStr = fromStatuses.map((s) => s.name).join(', ') ?? '*'
    return `${transitionObj?.name ?? ''}: ${fromNamesStr} → ${toStatus?.name ?? ''}`
  }

  function handleSelect (event: CustomEvent<ListItem>): void {
    const _id = event.detail._id as Ref<WorkflowTransition>
    selected = _id
    dispatch('select', _id)
  }
</script>

<ModernDropdown
  items={transitionItems}
  tooltip={transitionTooltip ? { label: getEmbeddedLabel(transitionTooltip) } : undefined}
  selected={selectedTransitionItem}
  on:selected={handleSelect}
  placeholder={ui.string.NotSelected}
  justify="left"
  width="100%"
  showCheckmark={true}
  popupClass="wide"
  withSearch={false}
/>
