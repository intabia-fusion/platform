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
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import type { IssueStatus } from '@hcengineering/tracker'
  import { SelectPopup, showPopup } from '@hcengineering/ui'
  import { SelectButton } from '@hcengineering/ui/kit'

  import tracker from '../../../plugin'
  import IssueStatusIcon from '../../issues/IssueStatusIcon.svelte'
  import StatusPresenter from '../../issues/StatusPresenter.svelte'

  // Default status of a project's new issues, one of `statuses`
  export let statuses: IssueStatus[]
  export let value: IssueStatus | undefined
  export let taskType: Ref<TaskType> | undefined
  export let projectType: Ref<ProjectType>
  export let onChange: (value: Ref<IssueStatus>) => void | Promise<void>

  let opened = false

  function choose (e: MouseEvent): void {
    opened = true
    showPopup(
      SelectPopup,
      {
        value: statuses.map((it) => ({
          id: it._id,
          component: StatusPresenter,
          props: { value: it, size: 'small' },
          isSelected: it._id === value?._id
        })),
        placeholder: tracker.string.SetStatus
      },
      e.currentTarget as HTMLElement,
      async (result: Ref<IssueStatus> | undefined) => {
        opened = false
        if (result !== undefined) await onChange(result)
      }
    )
  }
</script>

<SelectButton
  data-id="project-default-status"
  placeholder={tracker.string.SetStatus}
  empty={value === undefined}
  field
  fullWidth
  chevron
  pressed={opened}
  on:click={choose}
>
  {#if value !== undefined}
    <IssueStatusIcon {value} size="small" {taskType} {projectType} />
    <span class="overflow-label">{value.name}</span>
  {/if}
</SelectButton>
