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
<!--
  Office navigator. A floor is where people sit - picking one is how you find someone to call.
  Meetings lists what is planned, past meetings what has already happened.
-->
<script lang="ts">
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import {
    ButtonIcon,
    deviceOptionsStore as deviceInfo,
    eventToHTMLElement,
    getCurrentLocation,
    IconAdd,
    navigate,
    NavGroup,
    NavItem,
    Scroller,
    showPopup
  } from '@hcengineering/ui'
  import { NavFooter, NavHeader, TreeSeparator } from '@hcengineering/workbench-resources'
  import plugin from '../plugin'
  import { currentFloor, officeFloors, officeView, selectedFloor } from '../stores'
  import EditFloorPopup from './EditFloorPopup.svelte'

  const canAddFloor = hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)

  // Dropping the fragment closes whatever document was opened in the centre.
  function open (segment: string): void {
    const loc = getCurrentLocation()
    loc.path[3] = segment
    loc.path.length = 4
    loc.fragment = undefined
    navigate(loc)
  }
</script>

<div
  class="antiPanel-navigator {$deviceInfo.navigator.direction === 'horizontal' ? 'portrait' : 'landscape'} border-left"
  class:fly={$deviceInfo.navigator.float}
>
  <div class="antiPanel-wrap__content hulyNavPanel-container">
    <NavHeader label={plugin.string.Office} />
    <NavItem
      _id={'meetings'}
      label={plugin.string.Meetings}
      icon={plugin.icon.Cam}
      selected={$officeView === 'meetings'}
      on:click={() => { open('meetings') }}
    />
    <NavItem
      _id={'permanent'}
      label={plugin.string.PermanentMeetings}
      icon={plugin.icon.EnterRoom}
      selected={$officeView === 'permanent'}
      on:click={() => { open('permanent') }}
    />
    <TreeSeparator line />
    <Scroller shrink>
      <NavGroup label={plugin.string.Floors} categoryName={'love-floors'} isFold noDivider>
        <svelte:fragment slot="actions">
          {#if canAddFloor}
            <ButtonIcon
              icon={IconAdd}
              kind={'tertiary'}
              size={'min'}
              on:click={(e) => showPopup(EditFloorPopup, {}, eventToHTMLElement(e))}
            />
          {/if}
        </svelte:fragment>
        {#each $officeFloors as floor (floor._id)}
          <NavItem
            _id={floor._id}
            title={floor.name}
            selected={$officeView === 'floor' && floor._id === $currentFloor}
            on:click={() => {
              selectedFloor.set(floor._id)
              open(floor._id)
            }}
          />
        {/each}
      </NavGroup>
    </Scroller>
    <NavFooter split />
  </div>
</div>
