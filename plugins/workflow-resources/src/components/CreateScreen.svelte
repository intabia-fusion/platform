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
  import core, { Class, Doc, Ref } from '@hcengineering/core'
  import { Resource, translate } from '@hcengineering/platform'
  import presentation, { getClient, hasResource } from '@hcengineering/presentation'
  import { clearSettingsStore } from '@hcengineering/setting-resources'
  import task, { ProjectType, ProjectTypeDescriptor, Task } from '@hcengineering/task'
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

  import plugin from '../plugin'

  export let type: ProjectType
  export let descriptor: ProjectTypeDescriptor | undefined = undefined

  const client = getClient()

  let name = ''
  let description = ''
  let selectedClass: Ref<Class<Task>> | undefined = undefined
  let classItems: DropdownTextItem[] = []

  $: allowedClasses = Array.from(
    new Set(
      client
        .getModel()
        .findAllSync(
          task.class.TaskTypeDescriptor,
          descriptor?.allowedTaskTypeDescriptors != null
            ? { allowCreate: true, _id: { $in: descriptor.allowedTaskTypeDescriptors } }
            : { allowCreate: true }
        )
        .filter((p) => hasResource(p._id as unknown as Resource<unknown>))
        .map((it) => it.baseClass)
    )
  )

  $: if (selectedClass === undefined && allowedClasses.length > 0) {
    selectedClass = allowedClasses[0]
  }

  $: canSave = name.trim().length > 0 && name.length <= 100 && description.length <= 500 && selectedClass != null

  $: void updateClassItems(allowedClasses, $languageStore)

  async function updateClassItems (classes: Ref<Class<Doc>>[], lang: string): Promise<void> {
    const res: DropdownTextItem[] = []
    for (const cls of classes) {
      const _clazz = client.getHierarchy().getClass(cls)
      res.push({
        id: cls,
        icon: _clazz.icon,
        label: await translate(_clazz.label, {}, lang)
      })
    }

    classItems = res.sort((a, b) => a.label.localeCompare(b.label))
  }

  async function save (): Promise<void> {
    if (!canSave) return
    const descTrimmed = description.trim()
    const screenId = await client.createDoc(plugin.class.Screen, core.space.Workspace, {
      name: name.trim(),
      description: descTrimmed.length > 0 ? descTrimmed : undefined,
      projectType: type._id,
      targetClass: selectedClass
    })

    // Create initial default tab for the screen
    await addScreenTab(client, screenId, 'General')

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
    <div class="hulyModal-content__settingsSet-line flex-col" style="align-items: flex-start;">
      <span class="label mb-2">
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
    {#if allowedClasses.length > 0}
      <div class="hulyModal-content__settingsSet-line">
        <span class="label">
          <Label label={core.string.Class} />
        </span>
        <ModernDropdownLabels
          items={classItems}
          bind:selected={selectedClass}
          size="medium"
          placeholder={ui.string.NotSelected}
          autoSelect={true}
          enableSearch={false}
        />
      </div>
    {/if}
  </div>
</Modal>
