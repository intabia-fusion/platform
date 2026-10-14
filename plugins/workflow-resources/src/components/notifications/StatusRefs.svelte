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
  import type { Ref, Status } from '@hcengineering/core'
  import type { Project } from '@hcengineering/task'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { statusStore } from '@hcengineering/view-resources'

  export let ids: Array<Ref<Status>>
  export let space: Ref<Project> | undefined
</script>

{#each ids.map((id) => $statusStore.byId.get(id)) as value, i}{#if i > 0},{' '}{/if}<span class="status"
    ><StatePresenter {value} {space} inline shouldShowName={false} /><span class="name">{value?.name ?? ''}</span></span
  >{/each}

<style lang="scss">
  // Part of the sentence, not a link: no hover, no pointer.
  .status {
    margin-left: 0.25rem;
    white-space: nowrap;
    pointer-events: none;
  }

  .name {
    margin-left: 0.375rem;
  }
</style>
