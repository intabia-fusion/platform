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
  import { AnySvelteComponent } from '@hcengineering/ui'
  import { TaskType } from '@hcengineering/task'
  import { getResourceP } from '@hcengineering/platform'
  import { WorkflowRequest, WorkflowRequestConfig } from '@hcengineering/workflow'

  export let config: WorkflowRequestConfig
  export let taskType: TaskType
  export let request: WorkflowRequest | undefined = undefined

  let presenterCtor: AnySvelteComponent | undefined = undefined

  $: presenterResource = request?.presenter

  $: if (presenterResource != null) {
    const res = getResourceP(presenterResource)
    if (res instanceof Promise) {
      void res.then((c) => {
        presenterCtor = c
      })
    } else {
      presenterCtor = res
    }
  } else {
    presenterCtor = undefined
  }
</script>

{#if presenterCtor}
  <svelte:component this={presenterCtor} {config} {taskType} {request} />
{/if}
