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
  import core from '@hcengineering/core'
  import type { Ref, Status } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import StatePresenter from '../state/StatePresenter.svelte'

  export let value: Status
  export let projectType: Ref<ProjectType>
  export let taskTypes: TaskType[] = []
  export let showCategory: boolean = false

  $: categoryLabel = showCategory
    ? getClient().getModel().findAllSync(core.class.StatusCategory, { _id: value.category })[0]?.label
    : undefined

  $: names = taskTypes
    .filter((tt) => tt.statuses.includes(value._id))
    .map((tt) => tt.name)
    .join(', ')
</script>

<div class="flex-row-center flex-gap-2 w-full" style="min-width: 0">
  <span class="flex-no-shrink"><StatePresenter {value} {projectType} shrink={0} /></span>
  {#if categoryLabel !== undefined}
    <span class="overflow-label font-regular-12" style="color: var(--global-secondary-TextColor)">
      <Label label={categoryLabel} />
    </span>
  {/if}
  {#if names !== ''}
    <span class="overflow-label font-regular-12" style="color: var(--global-secondary-TextColor)">{names}</span>
  {/if}
</div>
