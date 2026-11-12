<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { getCurrentAccount } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { createQuery, IconWithEmoji } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { Icon, Label, getPaletteColorDef, getPlatformColorForTextDef, themeStore, tooltip } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { NavLink, getListColumnSizing } from '@hcengineering/view-resources'
  import tracker from '../../plugin'

  export let value: Project | Ref<Project> | undefined
  export let inline: boolean = false
  export let accent: boolean = false
  export let colorInherit: boolean = false
  export let kind: string = ''
  export let openIssues: boolean

  const { width: columnWidth, measure } = getListColumnSizing('project-name')
  $: aligned = kind === 'list' && $columnWidth !== undefined

  const projectQuery = createQuery()
  let projectObj: Project | undefined
  $: if (typeof value === 'string' && value !== undefined) {
    projectQuery.query<Project>(
      tracker.class.Project,
      { _id: value },
      (result) => {
        ;[projectObj] = result
      },
      { limit: 1 }
    )
  } else if (value !== undefined && typeof value === 'object') {
    projectObj = value
  } else {
    projectObj = undefined
  }
</script>

{#if projectObj}
  <div
    class="flex-presenter cursor-default"
    class:inline-presenter={inline}
    class:colorInherit
    class:aligned
    style:width={aligned ? `calc(${$columnWidth}px + 1.375rem)` : undefined}
    use:tooltip={kind === 'list' ? { label: getEmbeddedLabel(projectObj.name) } : undefined}
  >
    <div class="icon" class:emoji={projectObj.icon === view.ids.IconWithEmoji}>
      <Icon
        icon={projectObj.icon === view.ids.IconWithEmoji ? IconWithEmoji : (projectObj.icon ?? tracker.icon.Home)}
        iconProps={projectObj.icon === view.ids.IconWithEmoji
          ? { icon: projectObj.color }
          : {
              fill:
                getPaletteColorDef(projectObj.color, $themeStore.dark)?.icon ??
                getPlatformColorForTextDef(projectObj.name, $themeStore.dark).icon
            }}
        size="small"
      />
    </div>
    <span
      class="label no-underline nowrap"
      class:fs-bold={accent}
      use:measure={`${projectObj.name}|${projectObj.archived}|${$themeStore.language}`}
    >
      {#if openIssues && projectObj.members.includes(getCurrentAccount().uuid)}
        <NavLink space={projectObj._id} special="issues" noUnderline={false}>
          {projectObj.name}
        </NavLink>
      {:else}
        {projectObj.name}
      {/if}
      {#if projectObj.archived}
        <Label label={presentation.string.Archived} />
      {/if}
    </span>
  </div>
{/if}

<style lang="scss">
  .aligned {
    flex-shrink: 0;

    .icon {
      flex-shrink: 0;
    }
    .label {
      width: max-content;
      max-width: 100%;
    }
  }
</style>
