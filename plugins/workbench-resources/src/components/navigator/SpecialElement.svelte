<!--
// Copyright © 2021 Anticrm Platform Contributors.
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
  import type { Asset, IntlString } from '@hcengineering/platform'
  import type { Action } from '@hcengineering/ui'
  import { ButtonIcon, NavItem } from '@hcengineering/ui'

  export let icon: Asset | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let notifications = 0
  export let actions: Action[] = []
  export let selected: boolean = false
  export let disabled: boolean = false
  export let indent: boolean = false
  export let forciblyСollapsed: boolean = false

  let pendingAction: Action | undefined = undefined

  async function runAction (action: Action, evt: Event): Promise<void> {
    if (pendingAction === action) return
    pendingAction = action
    try {
      await action.action({}, evt)
    } finally {
      pendingAction = undefined
    }
  }
</script>

<NavItem
  {icon}
  {iconProps}
  iconSize={'small'}
  {label}
  count={notifications > 0 ? notifications : null}
  {selected}
  {disabled}
  {indent}
  {forciblyСollapsed}
>
  <svelte:fragment slot="actions">
    {#each actions as action}
      {#if action.icon}
        <ButtonIcon
          icon={action.icon}
          kind={'tertiary'}
          size={'extra-small'}
          tooltip={{ label: action.label }}
          loading={pendingAction === action}
          on:click={(evt) => {
            void runAction(action, evt)
          }}
        />
      {/if}
    {/each}
  </svelte:fragment>
</NavItem>
