<!--
//
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
//
-->
<script lang="ts">
  import type { Class, Doc, Ref, Space } from '@hcengineering/core'
  import type { ViewOptions, Filter } from '@hcengineering/view'
  import contact, { getCurrentEmployee } from '@hcengineering/contact'
  import view from '../../plugin'
  import { getResource } from '@hcengineering/platform'
  import ui, { Component, Icon, Label, type AnySvelteComponent } from '@hcengineering/ui'
  import { CURRENT_USER_FILTER_VALUE } from '../../currentUserFilter'

  export let filter: Filter
  export let space: Ref<Space> | undefined = undefined
  export let onChange: (filter: Filter) => void
  export let _class: Ref<Class<Doc>> | undefined = undefined
  export let viewOptions: ViewOptions | undefined = undefined

  const me = getCurrentEmployee()
  const editor = getResource<AnySvelteComponent>(filter.key.component)

  filter.modes = filter.modes ?? [view.filter.FilterObjectIn, view.filter.FilterObjectNin]
  filter.mode = filter.mode ?? filter.modes[0]

  $: selected = filter.value.includes(CURRENT_USER_FILTER_VALUE)
  $: concrete = { ...filter, value: filter.value.filter((value) => value !== CURRENT_USER_FILTER_VALUE) }

  function toggle (): void {
    filter = {
      ...filter,
      value: selected
        ? filter.value.filter((value) => value !== CURRENT_USER_FILTER_VALUE)
        : [CURRENT_USER_FILTER_VALUE, ...filter.value]
    }
    onChange(filter)
  }

  function update (value: Filter): void {
    filter = { ...value, value: selected ? [CURRENT_USER_FILTER_VALUE, ...value.value] : value.value }
    onChange(filter)
  }
</script>

{#await editor then Editor}
  <svelte:component this={Editor} filter={concrete} {space} onChange={update}>
    <svelte:fragment slot="beforeValues">
      <div class="box">
        <div class="menu-group__header flex-row-center">
          <span class="overflow-label"><Label label={contact.string.CategoryCurrentUser} /></span>
        </div>
        <button
          class="menu-item no-focus flex-row-center w-full"
          data-id="filterCurrentUser"
          aria-pressed={selected}
          on:click={toggle}
        >
          <div class="clear-mins flex-grow">
            <Component
              is={contact.component.EmployeePresenter}
              props={{ value: me, noUnderline: true, showPopup: false }}
              disabled
            />
          </div>
          <div class="check pointer-events-none">
            {#if selected}<Icon icon={ui.icon.Check} size="small" />{/if}
          </div>
        </button>
        <div class="menu-separator" />
      </div>
    </svelte:fragment>
  </svelte:component>
{/await}
