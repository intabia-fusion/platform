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
  import { Label } from '@hcengineering/ui'
  import { TaskType } from '@hcengineering/task'
  import { generateId } from '@hcengineering/core'
  import { getResourceP } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import {
    addValidatorConfig,
    updateValidatorConfig,
    Workflow,
    WorkflowTransition,
    WorkflowValidator,
    WorkflowValidatorConfig
  } from '@hcengineering/workflow'

  export let value: WorkflowValidator
  export let taskType: TaskType
  export let transition: WorkflowTransition
  export let workflow: Workflow | undefined = undefined
  export let config: WorkflowValidatorConfig | undefined = undefined
  export let canSave = false
  export let isSaving = false

  const client = getClient()

  let editorCtor: any = undefined
  let props: WorkflowValidatorConfig['props'] | undefined = undefined

  $: if (value?.editor != null) {
    const res = getResourceP(value.editor)
    if (res instanceof Promise) {
      void res.then((c) => {
        editorCtor = c
      })
    } else {
      editorCtor = res
    }
  } else {
    editorCtor = undefined
  }

  export async function save (): Promise<void> {
    if (editorCtor == null || props == null) return
    try {
      isSaving = true
      if (config != null) {
        await updateValidatorConfig(client, transition.attachedTo, transition._id, config.id, { props })
      } else {
        await addValidatorConfig(client, transition.attachedTo, transition._id, {
          id: generateId(),
          validator: value._id,
          props
        })
      }
    } finally {
      isSaving = false
    }
  }

  function handlePropsUpdate (ev: CustomEvent<WorkflowValidatorConfig['props']>): void {
    props = ev.detail
  }
</script>

<div class="validator-editor">
  <div class="validator-editor--header">
    <div class="validator-editor--title">
      <Label label={value.label} />
    </div>
    <div class="validator-editor--subtitle">
      <Label label={value.description} />
    </div>
  </div>

  <div class="validator-editor--body">
    {#if editorCtor}
      <svelte:component
        this={editorCtor}
        bind:canSave
        {taskType}
        {transition}
        {workflow}
        {config}
        on:update={handlePropsUpdate}
      />
    {/if}
  </div>
</div>

<style lang="scss">
  .validator-editor {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.5rem;
    width: 100%;

    &--header {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    &--title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--global-primary-TextColor);
    }

    &--subtitle {
      font-size: 0.8125rem;
      color: var(--global-secondary-TextColor);
    }

    &--body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
