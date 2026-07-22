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
  import ui, { DropdownTextItem, Label, languageStore, ModernDropdownLabels } from '@hcengineering/ui'
  import { WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { TaskType } from '@hcengineering/task'
  import core, { AttachedDoc, Collection, Doc, RefTo } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'

  import plugin from '../../../plugin'

  interface Props {
    fields: string[]
  }

  export let taskType: TaskType
  export let config: WorkflowValidatorConfig | undefined = undefined
  export let canSave = false

  const client = getClient()
  const dispatch = createEventDispatcher<{ update: Props }>()

  let items: DropdownTextItem[] = []
  let selected: string[] =
    config?.props?.fields != null && Array.isArray(config.props.fields) ? config.props.fields : []

  $: void updateItems($languageStore)
  $: canSave = selected.length > 0
  $: dispatch('update', { fields: selected })

  async function updateItems (lang: string): Promise<void> {
    const hierarchy = client.getHierarchy()
    const attrs = Array.from(hierarchy.getAllAttributes(taskType.ofClass).values()).filter(
      (it) => it.hidden !== true && it.readonly !== true
    )

    const regularAttrs: typeof attrs = []
    const collectionAttrs: typeof attrs = []

    for (const it of attrs) {
      if (hierarchy.isDerived(it.type._class, core.class.Collection) || it.type._class === core.class.ArrOf) {
        collectionAttrs.push(it)
      } else {
        regularAttrs.push(it)
      }
    }

    const buildItem = async (it: (typeof attrs)[number]): Promise<DropdownTextItem> => {
      if (hierarchy.isDerived(it.type._class, core.class.RefTo)) {
        const refTo = it.type as RefTo<Doc>
        const toClass = hierarchy.findClass(refTo.to)
        return {
          id: it._id,
          label: await translate(it.label, {}, lang),
          icon: it.icon ?? toClass?.icon ?? it.type?.icon,
          iconProps: it.iconProps
        }
      } else if (hierarchy.isDerived(it.type._class, core.class.Collection)) {
        const refTo = it.type as Collection<AttachedDoc>
        const ofClass = hierarchy.findClass(refTo.of)
        return {
          id: it._id,
          label: await translate(it.label, {}, lang),
          icon: it.icon ?? ofClass?.icon ?? it.type?.icon,
          iconProps: it.iconProps
        }
      }
      return {
        id: it._id,
        label: await translate(it.label, {}, lang),
        icon: it.icon ?? it.type?.icon,
        iconProps: it.iconProps
      }
    }

    const regularItems = await Promise.all(regularAttrs.map((it) => buildItem(it)))
    const collectionItems = await Promise.all(collectionAttrs.map((it) => buildItem(it)))

    regularItems.sort((a, b) => a.label.localeCompare(b.label, lang))
    collectionItems.sort((a, b) => a.label.localeCompare(b.label, lang))

    if (regularItems.length > 0 && collectionItems.length > 0) {
      collectionItems[0].separatorBefore = true
    }

    items = [...regularItems, ...collectionItems]
  }
</script>

<div class="field-required">
  <span class="field-required--label">
    <Label label={plugin.string.FieldRequiredValidator} />
  </span>
  <ModernDropdownLabels
    {items}
    bind:selected
    multiselect={true}
    wrap={true}
    autoSelect={false}
    placeholder={ui.string.NotSelected}
    justify="left"
    width="100%"
  />
</div>

<style lang="scss">
  .field-required {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;

    &--label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
