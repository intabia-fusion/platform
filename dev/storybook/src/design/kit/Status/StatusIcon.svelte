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
  import { Icon } from '@hcengineering/ui'
  import IconBacklog from '../../../../../../plugins/task-resources/src/components/icons/IconBacklog.svelte'
  import IconCanceled from '../../../../../../plugins/task-resources/src/components/icons/IconCanceled.svelte'
  import IconCompleted from '../../../../../../plugins/task-resources/src/components/icons/IconCompleted.svelte'
  import IconStarted from '../../../../../../plugins/task-resources/src/components/icons/IconStarted.svelte'
  import IconUnstarted from '../../../../../../plugins/task-resources/src/components/icons/IconUnstarted.svelte'
  import { categoryColor, paletteIndex } from '../palette'
  import type { Status } from '../types'

  export let status: Status
  export let size: 'x-small' | 'small' = 'small'

  const icons = {
    backlog: IconBacklog,
    todo: IconUnstarted,
    active: IconStarted,
    won: IconCompleted,
    lost: IconCanceled
  }
  $: fill = paletteIndex(status.color ?? categoryColor[status.category])
</script>

<span class="kit-status-icon">
  <Icon icon={icons[status.category]} {size} iconProps={{ fill }} />
</span>

<style>
  .kit-status-icon {
    display: inline-flex;
    flex-shrink: 0;
  }
</style>
