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
  import { generateId } from '@hcengineering/core'
  import { getResourceP, Resource } from '@hcengineering/platform'
  import { getClient, reduceCalls } from '@hcengineering/presentation'
  import { TaskType } from '@hcengineering/task'
  import { AnySvelteComponent, Label } from '@hcengineering/ui'
  import {
    addPostFunctionConfig,
    updatePostFunctionConfig,
    Workflow,
    WorkflowPostFunction,
    WorkflowPostFunctionConfig,
    WorkflowTransition
  } from '@hcengineering/workflow'

  export let value: WorkflowPostFunction
  export let taskType: TaskType
  export let transition: WorkflowTransition
  export let workflow: Workflow | undefined = undefined
  export let config: WorkflowPostFunctionConfig | undefined = undefined
  export let canSave = false
  export let isSaving = false

  const client = getClient()

  let editorCtor: AnySvelteComponent | undefined = undefined
  let props: WorkflowPostFunctionConfig['props'] | undefined = undefined

  $: void loadEditor(value?.editor)

  const loadEditor = reduceCalls(async (resource?: Resource<AnySvelteComponent>): Promise<void> => {
    if (resource != null) {
      editorCtor = await getResourceP(resource)
    } else {
      editorCtor = undefined
    }
  })

  export async function save (): Promise<void> {
    if (editorCtor == null || props == null) return
    try {
      isSaving = true
      if (config != null) {
        await updatePostFunctionConfig(client, transition.attachedTo, transition._id, config.id, { props })
      } else {
        await addPostFunctionConfig(client, transition.attachedTo, transition._id, {
          id: generateId(),
          postFunction: value._id,
          props
        })
      }
    } finally {
      isSaving = false
    }
  }

  function handlePropsUpdate (ev: CustomEvent<WorkflowPostFunctionConfig['props']>): void {
    props = ev.detail
  }
</script>

<div class="post-function-editor">
  <div class="post-function-editor__header">
    <div class="post-function-editor__title">
      <Label label={value.label} />
    </div>
    <div class="post-function-editor__subtitle">
      <Label label={value.description} />
    </div>
  </div>

  <div class="post-function-editor__body">
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
  .post-function-editor {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 0.5rem;
    width: 100%;

    &__header {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    &__title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--global-primary-TextColor);
    }

    &__subtitle {
      font-size: 0.8125rem;
      color: var(--global-secondary-TextColor);
    }

    &__body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>
