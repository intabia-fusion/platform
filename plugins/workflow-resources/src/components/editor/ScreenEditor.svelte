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
  import { onDestroy } from 'svelte'
  import { Class, Doc, Ref } from '@hcengineering/core'
  import { Asset, translate } from '@hcengineering/platform'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import { Task } from '@hcengineering/task'
  import ui, {
    ButtonIcon,
    DropdownTextItem,
    EditBox,
    IconDelete,
    languageStore,
    Loading,
    ModernButton,
    ModernDropdownLabels,
    Scroller,
    showPopup,
    TextArea
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { addScreenTab, Screen, ScreenField, ScreenTab } from '@hcengineering/workflow'

  import plugin from '../../plugin'
  import { navigateToScreen } from '../../location'
  import ScreenTabEditor from './ScreenTabEditor.svelte'
  import { DisplayAttribute, getDisplayAttributes } from '../../utils'

  export let objectId: Ref<Screen>
  export let name: string | undefined = undefined
  export let icon: Asset | undefined = undefined
  export let readonly = false

  const client = getClient()
  const screenQuery = createQuery()
  const fieldsQuery = createQuery()

  let screen: Screen | undefined
  let tabs: ScreenTab[] = []
  let allFields: ScreenField[] = []
  let displayAttributes: DisplayAttribute[] = []
  let isScreenLoading = true

  let classItem: DropdownTextItem | undefined = undefined

  let localName = ''
  let localDescription = ''
  let loadedScreenId: Ref<Screen> | undefined = undefined

  $: screenQuery.query(
    plugin.class.Screen,
    { _id: objectId },
    (res) => {
      const r = res.shift()
      screen = r
      tabs = (r?.$lookup?.tabs ?? []) as ScreenTab[]
      isScreenLoading = false
    },
    {
      lookup: {
        _id: {
          tabs: plugin.class.ScreenTab
        }
      }
    }
  )

  $: if (screen != null && screen._id !== loadedScreenId) {
    loadedScreenId = screen._id
    localName = screen.name ?? ''
    localDescription = screen.description ?? ''
  }

  $: tabIds = tabs.map((t) => t._id)

  $: fieldsQuery.query(plugin.class.ScreenField, { attachedTo: { $in: tabIds } }, (res) => {
    allFields = res
  })

  $: name = localName
  $: icon = plugin.icon.Screens
  $: usedFields = new Set(allFields.map((f) => f.fieldId))

  $: sortedTabs = [...tabs].sort((a: ScreenTab, b: ScreenTab) => {
    const rankA = a.rank ?? ''
    const rankB = b.rank ?? ''
    return rankA < rankB ? -1 : rankA > rankB ? 1 : 0
  })

  $: void updateDisplayAttributes(screen?.targetClass, $languageStore)
  $: void updateClassItem(screen?.targetClass, $languageStore)

  async function updateDisplayAttributes (_class: Ref<Class<Task>> | undefined, lang: string): Promise<void> {
    if (_class == null) {
      displayAttributes = []
      return
    }

    const { regular, collection } = await getDisplayAttributes(_class, lang)

    displayAttributes = [...regular, ...collection]
  }

  async function saveName (): Promise<void> {
    if (screen != null) {
      const trimmed = localName.trim()
      if (trimmed !== '' && trimmed !== screen.name) {
        await client.update(screen, { name: trimmed })
      }
    }
  }

  async function saveDescription (): Promise<void> {
    if (screen != null) {
      const trimmed = localDescription.trim()
      const val = trimmed.length > 0 ? trimmed : undefined
      if (val !== screen.description) {
        await client.update(screen, { description: val })
      }
    }
  }

  onDestroy(() => {
    void saveName()
    void saveDescription()
  })

  async function handleRemoveScreen (): Promise<void> {
    if (screen == null) return
    showPopup(MessageBox, {
      label: plugin.string.DeleteScreen,
      message: plugin.string.DeleteScreenConfirm,
      params: { name: screen.name },
      dangerous: true,
      action: async () => {
        if (screen != null) {
          await client.remove(screen)
          navigateToScreen(undefined)
        }
      }
    })
  }

  async function updateClassItem (_class: Ref<Class<Doc>> | undefined, lang: string): Promise<void> {
    if (_class == null) return
    const _clazz = client.getHierarchy().getClass(_class)

    classItem = {
      id: _class,
      icon: _clazz.icon,
      label: await translate(_clazz.label, {}, lang)
    }
  }

  async function addTab (): Promise<void> {
    if (screen == null) return
    const tabName = await translate(plugin.string.TabNumbered, { num: tabs.length + 1 }, $languageStore)
    await addScreenTab(client, screen._id, tabName)
  }

  $: availableAttributes = displayAttributes.filter((f) => !usedFields.has(f.id))
</script>

<div class="hulyComponent-content__container columns">
  <div class="hulyComponent-content__column content">
    {#if isScreenLoading}
      <Loading />
    {:else if screen}
      <Scroller align="center" padding="var(--spacing-3)" bottomPadding="var(--spacing-3)">
        <div class="hulyComponent-content gap">
          <!-- Screen Header -->
          <div class="header flex flex-col gap-1">
            <div class="flex-between flex-row-center flex-gap-2">
              <div class="flex-grow min-w-0">
                <EditBox
                  bind:value={localName}
                  kind="modern-ghost-large"
                  on:blur={saveName}
                  required
                  fullSize
                  placeholder={plugin.string.Untitled}
                />
              </div>
              <div class="flex-row-center flex-gap-2 flex-shrink-0">
                {#if classItem != null}
                  <ModernDropdownLabels
                    items={[classItem]}
                    selected={screen.targetClass}
                    placeholder={ui.string.NotSelected}
                    size="small"
                    disabled
                  />
                {/if}
                {#if !readonly}
                  <ButtonIcon
                    icon={IconDelete}
                    tooltip={{ label: view.string.Delete, direction: 'bottom' }}
                    size="small"
                    kind="secondary"
                    on:click={handleRemoveScreen}
                  />
                {/if}
              </div>
            </div>
            <TextArea
              bind:value={localDescription}
              placeholder={plugin.string.Description}
              disabled={readonly}
              height="4.5rem"
              width="100%"
              wrap="soft"
              noFocusBorder
              on:blur={saveDescription}
            />
          </div>

          <!-- Tabs Editors -->
          {#each sortedTabs as tab (tab._id)}
            <ScreenTabEditor
              {tab}
              {readonly}
              canDelete={tabs.length > 1}
              {displayAttributes}
              {availableAttributes}
              fields={allFields.filter((it) => it.attachedTo === tab._id)}
            />
          {/each}

          {#if !readonly}
            <div class="flex justify-start">
              <ModernButton
                kind="secondary"
                size="small"
                label={plugin.string.AddTab}
                on:click={() => {
                  void addTab()
                }}
              />
            </div>
          {/if}
        </div>
      </Scroller>
    {/if}
  </div>
</div>

<style lang="scss">
  .header {
    :global(.antiEditBox) {
      margin-left: -1rem;
    }
  }
</style>
