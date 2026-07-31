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
  import { generateId, Status } from '@hcengineering/core'
  import { getResourceP, Resource } from '@hcengineering/platform'
  import { getClient, reduceCalls } from '@hcengineering/presentation'
  import { ProjectType, TaskType } from '@hcengineering/task'
  import { AnySvelteComponent, Label } from '@hcengineering/ui'
  import {
    addRequestConfig,
    updateRequestConfig,
    Workflow,
    WorkflowRequest,
    WorkflowRequestConfig,
    WorkflowTransition
  } from '@hcengineering/workflow'

  export let value: WorkflowRequest
  export let taskType: TaskType
  export let projectType: ProjectType | undefined = undefined
  export let transition: WorkflowTransition
  export let workflow: Workflow | undefined = undefined
  export let config: WorkflowRequestConfig | undefined = undefined
  export let statuses: Status[] = []
  export let canSave = false
  export let isSaving = false

  const client = getClient()

  let editorCtor: AnySvelteComponent | undefined = undefined
  let props: WorkflowRequestConfig['props'] | undefined = undefined

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
        await updateRequestConfig(client, transition.attachedTo, transition._id, config.id, { props })
      } else {
        await addRequestConfig(client, transition.attachedTo, transition._id, {
          id: generateId(),
          request: value._id,
          props
        })
      }
    } finally {
      isSaving = false
    }
  }

  function handlePropsUpdate (ev: CustomEvent<WorkflowRequestConfig['props']>): void {
    props = ev.detail
  }
</script>

<div class="request-editor">
  <div class="request-editor--header">
    <div class="request-editor--title">
      <Label label={value.label} />
    </div>
    <div class="request-editor--subtitle">
      <Label label={value.description} />
    </div>
  </div>

  <div class="request-editor--body">
    {#if editorCtor}
      <svelte:component
        this={editorCtor}
        bind:canSave
        {taskType}
        {projectType}
        {transition}
        {workflow}
        {config}
        on:update={handlePropsUpdate}
      />
    {/if}
  </div>
</div>

<style lang="scss">
  .request-editor {
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
