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
  import { createEventDispatcher } from 'svelte'
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { IconWithEmoji } from '@hcengineering/presentation'
  import type { Project } from '@hcengineering/tracker'
  import { getPaletteColorDef, getPlatformColorForTextDef, themeStore } from '@hcengineering/ui'
  import { Menu, Toggle, type MenuItem } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'

  import tracker from '../../plugin'
  import ProjectBaseItem from './ProjectBaseItem.svelte'

  // Choice of the base project: active ones, then archived ones behind the toggle
  export let projects: Project[]
  export let selected: Ref<Project> | undefined = undefined
  export let width: string | undefined = undefined

  const dispatch = createEventDispatcher()

  let showArchived = projects.find((it) => it._id === selected)?.archived === true

  function toItem (project: Project, heading: boolean): MenuItem<Ref<Project>> {
    return {
      id: project._id,
      label: getEmbeddedLabel(project.name),
      ...(project.icon === view.ids.IconWithEmoji
        ? { icon: IconWithEmoji, iconProps: { icon: project.color, size: 'small' } }
        : {
            icon: project.icon ?? tracker.icon.Home,
            iconProps: {
              fill:
                getPaletteColorDef(project.color, $themeStore.dark)?.icon ??
                getPlatformColorForTextDef(project.name, $themeStore.dark).icon
            }
          }),
      heading: heading
        ? project.archived
          ? tracker.string.ProjectBaseArchived
          : tracker.string.ProjectBaseActive
        : undefined,
      component: ProjectBaseItem,
      componentProps: { project }
    }
  }

  $: active = projects.filter((it) => !it.archived)
  $: archived = showArchived ? projects.filter((it) => it.archived) : []
  $: items = [...active.map((it, i) => toItem(it, i === 0)), ...archived.map((it, i) => toItem(it, i === 0))]
</script>

<div class="base-popup" style:width data-id="project-base-popup">
  <Menu
    {items}
    {selected}
    withSearch
    searchPlaceholder={tracker.string.ProjectBaseSearch}
    embedded
    on:close={(e) => dispatch('close', e.detail)}
  />
  <div class="footer">
    <Toggle
      id="project-base-show-archived"
      bind:checked={showArchived}
      size="small"
      label={tracker.string.ProjectBaseShowArchived}
    />
  </div>
</div>

<style lang="scss">
  .base-popup {
    display: flex;
    flex-direction: column;
    min-width: 20rem;
    max-height: 26rem;
    padding: 1px;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--small-BorderRadius);
    box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
      var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);

    :global(.menu) {
      flex: 1 1 auto;
      min-height: 0;
    }
    :global(.menu__list) {
      overflow-y: auto;
    }
  }
  .footer {
    flex-shrink: 0;
    padding: var(--spacing-1) var(--spacing-1_5);
    border-top: 1px solid var(--theme-popup-divider);
  }
</style>
