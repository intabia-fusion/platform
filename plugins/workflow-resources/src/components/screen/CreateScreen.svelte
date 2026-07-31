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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import core, { Class, Doc, Ref } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import presentation, { createQuery, getClient, reduceCalls } from '@hcengineering/presentation'
  import { clearSettingsStore } from '@hcengineering/setting-resources'
  import task, { ProjectType, TaskType } from '@hcengineering/task'
  import ui, {
    DropdownTextItem,
    Label,
    languageStore,
    Modal,
    ModernDropdownLabels,
    ModernEditbox,
    TextArea
  } from '@hcengineering/ui'
  import { addScreenTab } from '@hcengineering/workflow'

  import plugin from '../../plugin'

  export let type: ProjectType

  const client = getClient()
  const taskTypesQuery = createQuery()

  let name = ''
  let description = ''
  let selected: Ref<Class<Doc>> | undefined = undefined
  let classItems: DropdownTextItem[] = []

  let taskTypes: TaskType[] = []
  $: taskTypesQuery.query(task.class.TaskType, { parent: type._id }, (res) => {
    taskTypes = res
  })

  $: if (selected === undefined && taskTypes.length > 0) {
    selected = taskTypes[0].ofClass
  }

  $: canSave = name.trim().length > 0 && name.length <= 100 && description.length <= 500 && selected != null

  $: void updateClassItems(taskTypes, $languageStore)

  const updateClassItems = reduceCalls(async (types: TaskType[], lang: string): Promise<void> => {
    const res: DropdownTextItem[] = []
    const classes = new Set(types.map((t) => t.ofClass))
    for (const _class of classes) {
      const _clazz = client.getHierarchy().getClass(_class)
      res.push({
        id: _class,
        icon: _clazz.icon,
        label: await translate(_clazz.label, {}, lang)
      })
    }

    classItems = res.sort((a, b) => a.label.localeCompare(b.label, lang))
  })

  async function save (): Promise<void> {
    if (!canSave) return
    if (selected == null) return

    const descTrimmed = description.trim()
    const screenId = await client.createDoc(plugin.class.Screen, core.space.Workspace, {
      name: name.trim(),
      description: descTrimmed.length > 0 ? descTrimmed : undefined,
      projectType: type._id,
      targetClass: selected
    })

    // Create initial default tab for the screen
    const defaultTabName = await translate(plugin.string.General, {}, $languageStore)
    await addScreenTab(client, screenId, defaultTabName)

    clearSettingsStore()
  }
</script>

<Modal
  label={plugin.string.Screen}
  type="type-aside"
  okAction={save}
  {canSave}
  okLabel={presentation.string.Create}
  on:changeContent
  onCancel={() => {
    clearSettingsStore()
  }}
>
  <div class="hulyModal-content__titleGroup">
    <ModernEditbox bind:value={name} label={plugin.string.Name} size="large" kind="ghost" autoFocus limit={100} />
  </div>
  <div class="hulyModal-content__settingsSet">
    <div class="hulyModal-content__settingsSet-line flex-col description-line">
      <span class="label desc-label">
        <Label label={plugin.string.Description} />
      </span>
      <TextArea
        bind:value={description}
        placeholder={plugin.string.Description}
        width="100%"
        height="4.5rem"
        wrap="soft"
        noFocusBorder
      />
    </div>
    {#if taskTypes.length > 0}
      <div class="hulyModal-content__settingsSet-line">
        <span class="label">
          <Label label={core.string.Class} />
        </span>
        <ModernDropdownLabels
          items={classItems}
          bind:selected
          size="medium"
          placeholder={ui.string.NotSelected}
          autoSelect={true}
          enableSearch={false}
        />
      </div>
    {/if}
  </div>
</Modal>

<style lang="scss">
  .description-line {
    align-items: flex-start;

    .desc-label {
      margin-bottom: 0.5rem;
    }
  }
</style>
