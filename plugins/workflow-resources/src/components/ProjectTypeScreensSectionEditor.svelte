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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { SortingOrder } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { clearSettingsStore, settingsStore } from '@hcengineering/setting-resources'
  import { ProjectType, ProjectTypeDescriptor } from '@hcengineering/task'
  import { ButtonIcon, Icon, IconAdd, Label } from '@hcengineering/ui'
  import { Screen } from '@hcengineering/workflow'

  import plugin from '../plugin'
  import { navigateToScreen } from '../location'
  import CreateScreen from './CreateScreen.svelte'

  export let type: ProjectType
  export let descriptor: ProjectTypeDescriptor | undefined = undefined
  export let disabled = true

  const screensQuery = createQuery()

  let isLoading = true
  let screens: Screen[] = []

  $: screensQuery.query(
    plugin.class.Screen,
    { projectType: type._id },
    (res) => {
      screens = res
      isLoading = false
    },
    { sort: { name: SortingOrder.Ascending } }
  )
</script>

<div class="hulyTableAttr-header font-medium-12">
  <Icon icon={plugin.icon.Screens} size="small" />
  <span><Label label={plugin.string.Screens} /></span>
  <ButtonIcon
    kind="primary"
    icon={IconAdd}
    size="small"
    dataId="btnAddScreen"
    {disabled}
    loading={isLoading}
    on:click={() => {
      if (disabled) return
      if ($settingsStore.id !== 'createScreen') {
        clearSettingsStore()
      }
      $settingsStore = { id: 'createScreen', component: CreateScreen, props: { type, descriptor } }
    }}
  />
</div>

{#if screens.length > 0 && !isLoading}
  <div class="hulyTableAttr-content screen">
    {#each screens as screen}
      <button
        class="hulyTableAttr-content__row w-full justify-start text-left"
        on:click|stopPropagation={() => {
          navigateToScreen(screen._id, false)
        }}
      >
        <div class="hulyTableAttr-content__row-icon-wrapper">
          <Icon icon={plugin.icon.Screen} size="small" />
        </div>
        <div
          class="hulyTableAttr-content__row-label font-medium-14 screen-name"
          class:has-description={screen.description != null}
          title={screen.name}
        >
          {screen.name}
        </div>
        {#if screen.description}
          <div
            class="hulyTableAttr-content__row-label dark font-regular-14 screen-description"
            title={screen.description}
          >
            {screen.description}
          </div>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .hulyTableAttr-content__row {
    width: 100%;
    justify-content: flex-start;
    text-align: left;
  }

  .screen-name {
    flex-shrink: 0;

    &.has-description {
      max-width: 50%;
    }
  }

  .screen-description {
    flex-shrink: 1;
    min-width: 0;
  }
</style>
