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
  import { createEventDispatcher } from 'svelte'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import ui, { Button, DropdownTextItem, IconClose, Label, ModernDropdownLabels } from '@hcengineering/ui'
  import type { WorkflowFieldValue, WorkflowTransformCall } from '@hcengineering/workflow'

  import plugin from '../../../../plugin'
  import TransformRow from './TransformRow.svelte'
  import { ContextOption, FieldRow } from './types'
  import ValueEditor from './ValueEditor.svelte'

  export let _class: Ref<Class<Doc>>
  export let row: FieldRow
  export let canRemove: boolean = false
  export let dropdownItems: DropdownTextItem[] = []
  export let contextOptions: ContextOption[] = []

  const dispatch = createEventDispatcher<{
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    remove: void
    select: DropdownTextItem['id']
    value: WorkflowFieldValue
    context: MouseEvent
    transform: MouseEvent
    editTransform: { fn: WorkflowTransformCall, event: MouseEvent }
  }>()

  $: selectedFieldId = row.attribute?._id
</script>

<div class="update-field-row">
  <div class="update-field-row__main">
    <div class="update-field-row__col">
      <span class="update-field-row__label"><Label label={plugin.string.FieldId} /></span>
      <div class="update-field-row__input-wrapper">
        <ModernDropdownLabels
          items={dropdownItems}
          selected={selectedFieldId}
          autoSelect={false}
          placeholder={ui.string.NotSelected}
          justify="left"
          size="medium"
          width="100%"
          on:selected={(e) => {
            if (e.detail != null) {
              dispatch('select', e.detail)
            }
          }}
        />
      </div>
    </div>

    <div class="update-field-row__divider">=</div>

    <ValueEditor
      {_class}
      {row}
      {contextOptions}
      on:value={(e) => {
        dispatch('value', e.detail)
      }}
      on:context={(e) => {
        dispatch('context', e.detail)
      }}
    />

    <div class="update-field-row__remove" class:hidden={!canRemove}>
      <Button
        icon={IconClose}
        kind="ghost"
        disabled={!canRemove}
        on:click={() => {
          if (canRemove) {
            dispatch('remove')
          }
        }}
      />
    </div>
  </div>

  <TransformRow
    {row}
    on:transform={(e) => {
      dispatch('transform', e.detail)
    }}
    on:editTransform={(e) => {
      dispatch('editTransform', e.detail)
    }}
    on:value={(e) => {
      dispatch('value', e.detail)
    }}
  />
</div>

<style lang="scss">
  .update-field-row {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: var(--medium-BorderRadius);
    background-color: transparent;
    border: 1px solid var(--global-subtle-ui-BorderColor);

    &__main {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto;
      align-items: flex-end;
      gap: 0.75rem;
      width: 100%;
    }

    &__col {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      width: 100%;
      min-width: 0;
    }

    &__label {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
    }

    &__divider {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--global-tertiary-TextColor);
      height: 2.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 0.125rem;
      user-select: none;
    }

    &__remove {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 2.375rem;
      flex-shrink: 0;

      &.hidden {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
      }
    }
  }
</style>
