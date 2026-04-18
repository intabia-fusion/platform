<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import contact from '@intabiafusion/contact'
  import { createQuery } from '@intabiafusion/presentation'
  import { Execution, ProcessToDo } from '@intabiafusion/process'
  import time from '@intabiafusion/time'
  import { Component } from '@intabiafusion/ui'
  import plugin from '../plugin'

  export let value: Execution

  let todos: ProcessToDo[] = []

  const query = createQuery()
  query.query(
    plugin.class.ProcessToDo,
    {
      execution: value._id,
      doneOn: null
    },
    (res) => {
      todos = res
    }
  )
</script>

<div class="flex-col flex-gap-2 mt-4">
  {#each todos as todo (todo._id)}
    <div class="flex-row-center flex-gap-2">
      <Component
        is={contact.component.EmployeePresenter}
        props={{
          value: todo.user,
          disabled: true,
          avatarSize: 'card',
          shouldShowName: false,
          shouldShowPlaceholder: true
        }}
      />
      <Component is={time.component.ToDoPresenter} props={{ value: todo, withouthWorkItem: true, showCheck: true }} />
    </div>
  {/each}
</div>
