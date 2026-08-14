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
  import { Button, IconAdd, Label, ModernEditbox } from '@hcengineering/ui'
  import type { WorkflowConstValue, WorkflowFieldValue } from '@hcengineering/workflow'

  import plugin from '../../../../plugin'
  import { ContextOption, FieldRow } from './types'
  import { ensureFieldValue } from './utils'
  import Value from './Value.svelte'

  export let _class: Ref<Class<Doc>>
  export let row: FieldRow
  export let contextOptions: ContextOption[] = []

  const dispatch = createEventDispatcher<{
    value: WorkflowFieldValue
    context: MouseEvent
  }>()

  function handleEditorChange (val: WorkflowFieldValue | any): void {
    dispatch('value', ensureFieldValue(val))
  }

  function toConstValue (v: WorkflowFieldValue): WorkflowConstValue {
    return v as WorkflowConstValue
  }
</script>

<div class="update-field-value-editor__col">
  <span class="update-field-value-editor__label"><Label label={plugin.string.Value} /></span>
  <div class="update-field-value-editor__box" class:disabled={row.fieldKey === ''}>
    {#if row.value.type === 'preset' || row.value.type === 'this' || row.value.type === 'parent'}
      <div class="editor-content">
        <Value
          parsed={row.value}
          {_class}
          on:clear={() => {
            dispatch('value', { type: 'const', value: '' })
          }}
        />
      </div>
    {:else if row.editor}
      <div class="editor-content">
        <svelte:component
          this={row.editor}
          label={plugin.string.Value}
          kind="ghost"
          size="large"
          width="100%"
          justify="left"
          disabled={row.fieldKey === ''}
          type={row.attribute?.type}
          value={row.value.type === 'const' ? row.value.value : row.value}
          object={{ space: '' }}
          placeholder={plugin.string.Value}
          showNavigate={false}
          onChange={handleEditorChange}
        />
      </div>
    {:else if row.value.type === 'const'}
      <div class="editor-content">
        <ModernEditbox
          bind:value={row.value.value}
          label={plugin.string.Value}
          kind="ghost"
          width="100%"
          disabled={row.fieldKey === ''}
          on:input={() => {
            handleEditorChange({ type: 'const', value: toConstValue(row.value).value })
          }}
          on:change={() => {
            handleEditorChange({ type: 'const', value: toConstValue(row.value).value })
          }}
        />
      </div>
    {/if}

    {#if contextOptions.length > 0}
      <div class="box-actions">
        <Button
          icon={IconAdd}
          kind="ghost"
          disabled={row.fieldKey === ''}
          on:click={(e) => {
            if (row.fieldKey !== '') {
              dispatch('context', e)
            }
          }}
        />
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  .update-field-value-editor {
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

    &__box {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      height: 2.375rem;
      min-height: 2.375rem;
      border: 1px solid var(--theme-refinput-border, var(--global-subtle-ui-BorderColor));
      border-radius: var(--medium-BorderRadius, 0.375rem);
      background-color: var(--theme-refinput-bg, var(--theme-control-bg, transparent));
      width: 100%;
      box-sizing: border-box;
      padding-right: 0.25rem;
      gap: 0.25rem;

      &.disabled {
        opacity: 0.45;
        pointer-events: none;
        background-color: var(--theme-button-disabled, var(--theme-checkbox-disabled, rgba(0, 0, 0, 0.04)));
      }

      &:focus-within {
        border-color: var(--global-focus-BorderColor);
      }

      .editor-content {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
      }

      .box-actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
    }
  }
</style>
