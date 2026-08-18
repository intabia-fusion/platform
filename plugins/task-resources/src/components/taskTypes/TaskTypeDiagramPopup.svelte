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
  import { TaskType } from '@hcengineering/task'
  import { ButtonIcon, IconClose, Label, Modal } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import plugin from '../../plugin'
  import TaskTypeDiagram from './TaskTypeDiagram.svelte'

  export let taskTypes: TaskType[] = []

  const dispatch = createEventDispatcher()
</script>

<Modal type="type-component" scrollableContent={false} on:close>
  <svelte:fragment slot="beforeTitle">
    <ButtonIcon icon={IconClose} kind="tertiary" size="small" noPrint on:click={() => dispatch('close')} />
    <div class="hulyHeader-divider short no-line no-print" />
    <Label label={plugin.string.TaskTypesDiagram} />
  </svelte:fragment>

  <TaskTypeDiagram {taskTypes} />
</Modal>
