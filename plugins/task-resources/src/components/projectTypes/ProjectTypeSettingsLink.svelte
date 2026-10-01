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
  import { settingId } from '@hcengineering/setting'
  import type { ProjectType } from '@hcengineering/task'
  import { getCurrentResolvedLocation, IconOpenedArrow, ModernButton, navigate } from '@hcengineering/ui'
  import task from '../../plugin'

  export let projectType: Ref<ProjectType>
  export let onOpen: (() => void) | undefined = undefined
  export let flush: boolean = false

  function open (): void {
    onOpen?.()
    const loc = getCurrentResolvedLocation()
    loc.path[2] = settingId
    loc.path[3] = 'spaceTypes'
    loc.path[4] = projectType
    loc.path.length = 5
    loc.fragment = undefined
    navigate(loc)
  }
</script>

<div class="flex-row-center" class:flush>
  <ModernButton label={task.string.GoToSettings} icon={IconOpenedArrow} size="small" kind="tertiary" on:click={open} />
</div>

<style lang="scss">
  .flush {
    margin-left: calc(-1 * var(--spacing-1) - 0.34rem);
  }
</style>
