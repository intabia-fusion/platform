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
  import type { StatusCategory } from '@hcengineering/core'
  import task from '@hcengineering/task'
  import type { IconSize } from '@hcengineering/ui'
  import { Icon } from '@hcengineering/ui'
  import IconBacklog from '../icons/IconBacklog.svelte'
  import IconCanceled from '../icons/IconCanceled.svelte'
  import IconCompleted from '../icons/IconCompleted.svelte'
  import IconStarted from '../icons/IconStarted.svelte'
  import IconUnstarted from '../icons/IconUnstarted.svelte'

  export let value: StatusCategory | undefined
  export let size: IconSize = 'small'

  const categoryIcons = {
    [task.statusCategory.UnStarted]: IconBacklog,
    [task.statusCategory.ToDo]: IconUnstarted,
    [task.statusCategory.Active]: IconStarted,
    [task.statusCategory.Won]: IconCompleted,
    [task.statusCategory.Lost]: IconCanceled
  }

  // A half-filled circle stands for the whole Active category, not one of its statuses
  $: iconProps =
    value?._id === task.statusCategory.Active ? { fill: value.color, index: 1, count: 2 } : { fill: value?.color }
</script>

{#if value}
  <Icon icon={categoryIcons[value._id] ?? IconBacklog} {size} {iconProps} />
{/if}
