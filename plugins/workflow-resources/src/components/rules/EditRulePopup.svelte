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
  import { getClient } from '@hcengineering/presentation'
  import ui, { Modal, Label } from '@hcengineering/ui'
  import { Workflow, WorkflowTransition, WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { createEventDispatcher, SvelteComponent } from 'svelte'
  import { Ref, Status } from '@hcengineering/core'
  import { TaskType } from '@hcengineering/task'

  import plugin from '../../plugin'
  import { rulesDisplay } from '../../types'
  import TransitionsDropdown from '../TransitionsDropdown.svelte'

  export let workflow: Workflow
  export let taskType: TaskType
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition
  export let config: WorkflowValidatorConfig

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const dispatch = createEventDispatcher<{ close: void }>()
  const client = getClient()

  let canSave = false
  let isSaving = false
  let editorComponent: SvelteComponent | undefined = undefined

  $: selectedRule = client.getModel().findObject(config.validator)

  function onSelectTransition (event: CustomEvent<Ref<WorkflowTransition>>): void {
    const _id = event.detail
    const found = transitions.find((t) => t._id === _id)
    if (found != null) {
      transition = found
    }
  }

  async function handleSave (): Promise<void> {
    if (editorComponent == null) return
    if (editorComponent.save != null) {
      await editorComponent.save()
    }
    dispatch('close')
  }
</script>

<Modal
  type="type-popup"
  okAction={handleSave}
  okLabel={ui.string.Save}
  okLoading={isSaving}
  canSave={transition != null && selectedRule != null && editorComponent != null && canSave}
  label={selectedRule?.label ?? plugin.string.Validators}
  maxWidth="45rem"
  padding="0"
  scrollableContent={false}
  onCancel={() => dispatch('close')}
>
  <div class="edit-rule-popup">
    <!-- Main Content Area -->
    <div class="edit-rule-popup--content">
      {#if transitions.length > 0}
        <!-- Transition Selector -->
        <div class="edit-rule-popup--transition-bar">
          <span class="edit-rule-popup--transition-label">
            <Label label={plugin.string.Transition} />
          </span>
          <TransitionsDropdown {transitions} {statuses} selected={transition._id} on:select={onSelectTransition} />
        </div>
      {/if}

      <!-- Rule Editor -->
      <div class="edit-rule-popup--body">
        {#if selectedRule != null}
          {@const editor = rulesDisplay[selectedRule._class]?.editor}
          {#if editor}
            <svelte:component
              this={editor}
              bind:this={editorComponent}
              bind:canSave
              bind:isSaving
              value={selectedRule}
              {taskType}
              {transition}
              {workflow}
              {statuses}
              {config}
              on:close={() => dispatch('close')}
            />
          {/if}
        {/if}
      </div>
    </div>
  </div>
</Modal>

<style lang="scss">
  .edit-rule-popup {
    display: flex;
    width: 45rem;
    max-width: calc(100vw - 2rem);
    min-height: 20rem;
    max-height: 80vh;
    box-sizing: border-box;

    &--content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      padding: 1.25rem;
      gap: 1.25rem;
      overflow-y: auto;
    }

    &--transition-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }

    &--transition-label {
      flex-shrink: 0;
    }

    &--body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 0;
      width: 100%;
    }
  }
</style>
