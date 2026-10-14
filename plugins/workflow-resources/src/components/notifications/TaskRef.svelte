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
  import type { Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task, { type Task } from '@hcengineering/task'
  import { DocNavLink } from '@hcengineering/view-resources'

  export let _id: Ref<Task>
  export let identifier: string

  let doc: Task | undefined

  void getClient()
    .findOne(task.class.Task, { _id })
    .then((res) => {
      doc = res
    })
</script>

{#if doc !== undefined}<DocNavLink object={doc} colorInherit>{doc.identifier}</DocNavLink>{:else}{identifier}{/if}
