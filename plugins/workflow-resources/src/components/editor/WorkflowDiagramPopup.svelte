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
  import { Status } from '@hcengineering/core'
  import { ButtonIcon, IconClose, IconMaximize, IconMinimize, Modal } from '@hcengineering/ui'
  import { Workflow, WorkflowTransition } from '@hcengineering/workflow'

  import WorkflowDiagram from './WorkflowDiagram.svelte'

  export let workflow: Workflow
  export let statuses: Status[] = []
  export let transitions: WorkflowTransition[] = []
  export let fullSize = true

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const dispatch = createEventDispatcher<{ close: void, fullsize: boolean }>()
</script>

<Modal type="type-component" scrollableContent={false} on:fullsize on:close>
  <svelte:fragment slot="beforeTitle">
    <ButtonIcon
      icon={IconClose}
      kind="tertiary"
      size="small"
      noPrint
      on:click={() => {
        dispatch('close')
      }}
    />
    <div class="hulyHeader-divider short no-line no-print" />
    <ButtonIcon
      icon={!fullSize ? IconMaximize : IconMinimize}
      kind="tertiary"
      size="small"
      noPrint
      on:click={() => {
        fullSize = !fullSize
        dispatch('fullsize', fullSize)
      }}
    />
    <div class="hulyHeader-divider short no-print" />
  </svelte:fragment>

  <WorkflowDiagram {workflow} {statuses} {transitions} />
</Modal>
