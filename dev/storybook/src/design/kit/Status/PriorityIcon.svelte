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
  import type { Asset } from '@hcengineering/platform'
  import { Icon } from '@hcengineering/ui'
  import type { Priority } from '../types'

  export let priority: Priority = 'none'

  const names: Record<Priority, string> = {
    none: 'PriorityNoPriority',
    urgent: 'PriorityUrgent',
    high: 'PriorityHigh',
    medium: 'PriorityMedium',
    low: 'PriorityLow'
  }
  $: icon = `tracker:icon:${names[priority]}` as Asset
</script>

<span class="kit-priority-icon"><Icon {icon} size="small" /></span>

<style>
  .kit-priority-icon {
    display: inline-flex;
    flex-shrink: 0;
  }
</style>
