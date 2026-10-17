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
  import type { Ref } from '@hcengineering/core'
  import { translate, translateCB } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { TaskType } from '@hcengineering/task'
  import { getConnectedTaskTypes } from '@hcengineering/task'
  import {
    Button,
    Icon,
    IconAdd,
    IconError,
    IconInfo,
    Label,
    languageStore,
    SelectPopup,
    showPopup,
    themeStore,
    Toggle,
    tooltip
  } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import setting from '@hcengineering/setting'

  import task from '../../plugin'
  import { addParentTo, getAncestorLevels, getChildTypes, getParentTypes, removeParentFrom } from '../../hierarchy'
  import { openTaskTypeSettings } from '../../utils'
  import TaskTypeChip from './TaskTypeChip.svelte'
  import TaskTypeDiagramPopup from './TaskTypeDiagramPopup.svelte'
  import TaskTypeHierarchyHelp from './TaskTypeHierarchyHelp.svelte'

  export let taskType: TaskType
  export let taskTypes: TaskType[] = []
  export let readonly: boolean = false

  const client = getClient()
  const anyId = 'any'

  $: isRootTaskType = taskType.isRootTaskType !== false
  $: allowAnyParent = taskType.allowAnyParent === true
  $: allowedAsChildOf = taskType.allowedAsChildOf ?? []

  $: parents = getParentTypes(taskType, taskTypes)
  $: ancestorLevels = getAncestorLevels(taskType, taskTypes)
  $: children = getChildTypes(taskType, taskTypes)

  $: hasWarning = !isRootTaskType && !allowAnyParent && allowedAsChildOf.length === 0

  // First type that has explicit parents makes the best example for the help
  $: exampleType = taskTypes.find((t) => t.allowAnyParent !== true && (t.allowedAsChildOf ?? []).length > 0)
  // The tooltip is a component, so the button is named separately.
  let helpName = ''
  $: translateCB(task.string.HierarchyRelations, {}, $languageStore === '' ? undefined : $languageStore, (text) => {
    helpName = text
  })
  $: helpProps = {
    child: exampleType?.name ?? taskType.name,
    parents: getParentTypes(exampleType ?? taskType, taskTypes)
      .map((t) => t.name)
      .join(', ')
  }

  async function handleAllowRootChange (val: boolean): Promise<void> {
    if (readonly) return
    await client.diffUpdate(taskType, { isRootTaskType: val })
  }

  async function removeParent (parentId: Ref<TaskType>): Promise<void> {
    if (readonly) return
    await client.diffUpdate(taskType, removeParentFrom(taskType, parentId, taskTypes))
  }

  async function removeChild (child: TaskType): Promise<void> {
    if (readonly) return
    await client.diffUpdate(child, removeParentFrom(child, taskType._id, taskTypes))
  }

  async function clearAnyParent (): Promise<void> {
    if (readonly) return
    await client.diffUpdate(taskType, { allowAnyParent: false, allowedAsChildOf: [] })
  }

  async function addParent (id: Ref<TaskType> | typeof anyId): Promise<void> {
    if (readonly) return
    if (id === anyId) {
      await client.diffUpdate(taskType, { allowAnyParent: true, allowedAsChildOf: taskTypes.map((t) => t._id) })
      return
    }
    await client.diffUpdate(taskType, addParentTo(taskType, id, taskTypes))
  }

  async function openTypesPopup (
    evt: MouseEvent,
    available: TaskType[],
    withAny: boolean,
    onPick: (id: Ref<TaskType> | typeof anyId) => void
  ): Promise<void> {
    const selfMark = await translate(task.string.SameTypeNesting, {}, $themeStore.language)
    const value = [
      ...(withAny ? [{ id: anyId, label: task.string.AllowAnyParent }] : []),
      ...[...available]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ id: t._id, text: t._id === taskType._id ? `${t.name} (${selfMark})` : t.name }))
    ]
    showPopup(SelectPopup, { value, searchable: true }, evt.currentTarget as HTMLElement, (id: string | undefined) => {
      if (id !== undefined) onPick(id as Ref<TaskType> | typeof anyId)
    })
  }

  async function handleAdd (evt: MouseEvent): Promise<void> {
    await openTypesPopup(
      evt,
      taskTypes.filter((t) => !allowedAsChildOf.includes(t._id)),
      true,
      (id) => {
        void addParent(id)
      }
    )
  }

  async function handleAddChild (evt: MouseEvent): Promise<void> {
    await openTypesPopup(
      evt,
      taskTypes.filter((t) => !children.some((c) => c._id === t._id)),
      false,
      (id) => {
        const child = taskTypes.find((t) => t._id === id)
        if (child !== undefined) void client.diffUpdate(child, addParentTo(child, taskType._id, taskTypes))
      }
    )
  }

  function handleShowDiagram (): void {
    const connectedTypes = getConnectedTaskTypes(taskType, taskTypes)
    showPopup(TaskTypeDiagramPopup, { taskTypes: connectedTypes, focusTypeId: taskType._id }, 'centered')
  }
</script>

<div class="hierarchy-section flex-column gap-3 w-full">
  <div class="hulyTableAttr-container w-full">
    <div class="hulyTableAttr-header font-medium-12">
      <div class="header-left flex-row-center gap-1-5">
        <Icon icon={setting.icon.Clazz} size="small" />
        <span class="header-title"><Label label={task.string.HierarchyRelations} /></span>
      </div>

      <div class="header-right flex-row-center gap-2">
        <IconButton
          icon={IconInfo}
          size="small"
          kind="tertiary"
          tooltip={{ component: TaskTypeHierarchyHelp, props: helpProps, direction: 'bottom' }}
          aria-label={helpName}
        />
        <Button
          icon={task.icon.TypeHierarchy}
          label={task.string.HierarchyShowSchema}
          size="small"
          kind="ghost"
          on:click={handleShowDiagram}
        />
      </div>
    </div>

    <div class="hulyTableAttr-content flex-column w-full">
      <div class="root-toggle-row w-full">
        <div class="title-wrapper">
          <span class="font-medium-14 title-text">
            <Label label={task.string.AllowRootTask} />
          </span>
          <span class="font-normal-12 subtitle-text">
            <Label label={task.string.AllowRootTaskTooltip} />
          </span>
        </div>
        <div class="toggle-slot">
          <Toggle
            on={isRootTaskType}
            disabled={readonly}
            on:change={(evt) => {
              void handleAllowRootChange(evt.detail)
            }}
          />
        </div>
      </div>

      <div class="chain">
        <span class="chain-title font-medium-13">
          <Label label={task.string.HierarchyParentsOf} params={{ name: taskType.name }} />
        </span>

        {#each ancestorLevels as level}
          <div class="chain-row">
            {#if level.any}
              <TaskTypeChip label={task.string.AllowAnyParent} kind="muted" />
            {:else}
              {#each level.types as t (t._id)}
                <TaskTypeChip
                  value={t}
                  kind="muted"
                  clickable
                  on:open={() => {
                    openTaskTypeSettings(t._id)
                  }}
                />
              {/each}
            {/if}
          </div>
          <div class="connector" />
        {/each}

        <div class="chain-row">
          <div class="group" class:empty={!allowAnyParent && parents.length === 0}>
            {#if allowAnyParent}
              <TaskTypeChip label={task.string.AllowAnyParent} removable={!readonly} on:remove={clearAnyParent} />
            {:else}
              {#each parents as t (t._id)}
                <TaskTypeChip
                  value={t}
                  mark={t._id === taskType._id ? task.string.SameTypeNesting : undefined}
                  clickable={t._id !== taskType._id}
                  removable={!readonly}
                  on:open={() => {
                    openTaskTypeSettings(t._id)
                  }}
                  on:remove={() => removeParent(t._id)}
                />
              {/each}
            {/if}
            {#if (!readonly && !allowAnyParent) || hasWarning}
              <div class="side">
                {#if !readonly && !allowAnyParent}
                  <IconButton
                    icon={IconAdd}
                    size="small"
                    kind="secondary"
                    tooltip={{ label: task.string.HierarchyAddParent }}
                    on:click={handleAdd}
                  />
                {/if}
                {#if hasWarning}
                  <div
                    class="header-error-badge"
                    use:tooltip={{ label: task.string.HierarchyWarningNoParentAndNoRoot }}
                  >
                    <Icon icon={IconError} size="small" />
                    <span class="error-text"><Label label={task.string.HierarchyWarningShort} /></span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
        <div class="connector" />

        <div class="chain-row">
          <TaskTypeChip value={taskType} kind="current" mark={task.string.SameTypeNesting} />
        </div>

        {#if children.length > 0 || !readonly}
          <div class="connector" />
          <div class="chain-row">
            <div class="group" class:empty={children.length === 0}>
              {#each children as t (t._id)}
                <TaskTypeChip
                  value={t}
                  kind="muted"
                  clickable={t._id !== taskType._id}
                  removable={!readonly}
                  on:open={() => {
                    openTaskTypeSettings(t._id)
                  }}
                  on:remove={() => removeChild(t)}
                />
              {/each}
              {#if !readonly}
                <div class="side">
                  <IconButton
                    icon={IconAdd}
                    size="small"
                    kind="secondary"
                    tooltip={{ label: task.string.HierarchyAddChild }}
                    on:click={handleAddChild}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .hierarchy-section {
    width: 100%;
  }

  .hulyTableAttr-container {
    overflow: hidden;
    border-radius: var(--large-BorderRadius, 0.75rem);
  }

  .w-full {
    width: 100%;
    box-sizing: border-box;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--global-secondary-TextColor);
  }

  .root-toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-2_5);
    background: transparent;
    border-bottom: 1px solid var(--theme-divider-color, rgba(0, 0, 0, 0.08));

    .title-wrapper {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      flex-grow: 1;
    }

    .title-text {
      color: var(--global-primary-TextColor);
      display: block;
      line-height: 1.25rem;
    }

    .subtitle-text {
      color: var(--global-secondary-TextColor);
      display: block;
      line-height: 1rem;
    }

    .toggle-slot {
      margin-left: 1rem;
      flex-shrink: 0;
    }
  }

  .chain {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    box-sizing: border-box;
    padding: var(--spacing-2) var(--spacing-2_5);

    .chain-title {
      margin-bottom: 0.5rem;
      color: var(--global-secondary-TextColor);
    }
  }

  .chain-row {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
  }

  // Chips are centered on the axis; the side block (add button, warning) hangs outside the group
  .group {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    max-width: calc(100% - 4rem);

    &.empty {
      max-width: 100%;
    }
  }

  .side {
    position: absolute;
    left: calc(100% + 0.5rem);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 0.375rem;

    .empty > & {
      position: static;
      transform: none;
    }
  }

  // Downward arrow: parent -> child
  .connector {
    position: relative;
    height: 2rem;
    width: 0;
    flex-shrink: 0;
    align-self: center;
    margin: 0.25rem 0;
    border-left: 2px solid var(--global-secondary-TextColor);

    &::after {
      content: '';
      position: absolute;
      left: -6px;
      bottom: -1px;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 7px solid var(--global-secondary-TextColor);
    }
  }

  .header-error-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 999px;
    color: var(--global-negative-TextColor, #ef4444);
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
    cursor: help;
    transition: background-color 0.15s ease-in-out;

    span {
      margin-left: 0 !important;
      flex-grow: 0 !important;
    }

    &:hover {
      background: rgba(239, 68, 68, 0.14);
    }

    .error-text {
      color: var(--global-negative-TextColor, #ef4444);
    }
  }
</style>
