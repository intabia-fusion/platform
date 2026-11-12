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
  Floors as a list, the way the chat lists its conversations: a floor folds and unfolds, its rooms
  sit inside with the people who are in them, and dragging a floor moves it up or down. Picking a
  floor opens its grid in the centre; picking a room opens the room itself, where the call starts.
-->
<script lang="ts">
  import type { Person } from '@hcengineering/contact'
  import { Avatar, getPersonsByPersonRefs } from '@hcengineering/contact-resources'
  import { AccountRole, getCurrentAccount, hasAccountRole, type Ref } from '@hcengineering/core'
  import type { Floor, Office, Room } from '@hcengineering/love'
  import { isOffice } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import ui, {
    eventToHTMLElement,
    getCurrentLocation,
    Icon,
    Menu,
    navigate,
    NavGroup,
    NavItem,
    showPopup,
    type Action
  } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { openDoc } from '@hcengineering/view-resources'
  import plugin from '../plugin'
  import { persistFloorOrder, reorderFloors } from '../floors'
  import { currentFloor, infos, officeFloors, officeView, rooms, selectedFloor, selectedRoomPlace } from '../stores'
  import { getRoomName, showRoomSettings } from '../utils'
  import AddRoomPopup from './AddRoomPopup.svelte'

  // Only the people who arrange the office see the plus and the room menu at all.
  const canManageRooms =
    hasAccountRole(getCurrentAccount(), AccountRole.Owner) ||
    hasAccountRole(getCurrentAccount(), AccountRole.Maintainer)

  let drag: Ref<Floor> | undefined
  let names = new Map<Ref<Room>, string>()
  // The owner's avatar is what makes a row look like a chat: the person the seat belongs to.
  let persons = new Map<Ref<Person>, Person>()

  $: void loadNames($rooms)
  $: void loadPersons($rooms)

  // Office rooms are named after their owner, so the name is a lookup, not a field.
  async function loadNames (rooms: Room[]): Promise<void> {
    const missing = rooms.filter((it) => !names.has(it._id))
    if (missing.length === 0) return
    const next = new Map(names)
    for (const room of missing) {
      next.set(room._id, await getRoomName(room))
    }
    names = next
  }

  async function loadPersons (rooms: Room[]): Promise<void> {
    const refs = rooms
      .filter((it): it is Office => isOffice(it) && it.person !== null)
      .map((it) => it.person as Ref<Person>)
      .filter((it) => !persons.has(it))
    if (refs.length === 0) return
    const found = await getPersonsByPersonRefs(refs)
    const next = new Map(persons)
    for (const [ref, person] of found) {
      next.set(ref, person)
    }
    persons = next
  }

  function ownerOf (room: Room): Person | undefined {
    return isOffice(room) && room.person !== null ? persons.get(room.person) : undefined
  }

  function roomsOf (floor: Ref<Floor>): Room[] {
    return $rooms.filter((it) => it.floor === floor)
  }

  function personsOf (room: Ref<Room>): string {
    return $infos
      .filter((it) => it.room === room)
      .map((it) => it.name)
      .join(', ')
  }

  function countOf (room: Ref<Room>): number | null {
    const count = $infos.filter((it) => it.room === room).length
    return count === 0 ? null : count
  }

  // Opening a floor puts its id into the URL, exactly like a floor link does: the centre then
  // renders the grid and the floor stays highlighted in the list.
  function openFloor (floor: Ref<Floor>): void {
    selectedFloor.set(floor)
    const loc = getCurrentLocation()
    loc.path[3] = floor
    loc.path.length = 4
    loc.fragment = undefined
    navigate(loc)
  }

  // The same as clicking the room on the grid: the room opens, with its join button.
  function openRoom (room: Room): void {
    selectedRoomPlace.set({ _id: room._id, x: 0, y: 0 })
    openDoc(getClient().getHierarchy(), room).catch((err) => {
      console.error('[FloorsNav.openRoom] Failed to open room', err)
    })
  }

  function dropOnFloor (target: Ref<Floor>): void {
    const moved = drag
    drag = undefined
    if (moved === undefined || moved === target) return
    const floors = $officeFloors
    persistFloorOrder(getClient(), floors, reorderFloors(floors, moved, target)).catch((err) => {
      console.error('[FloorsNav.drop] Failed to persist the floor order', err)
    })
  }

  // A new room belongs to this floor from the start: the popup takes the floor it was opened from.
  function addRoom (event: MouseEvent, floor: Ref<Floor>): void {
    event.stopPropagation()
    showPopup(AddRoomPopup, { floor }, eventToHTMLElement(event))
  }

  // The same menu a chat row has: open the room, or change it, without leaving the list.
  function showRoomMenu (event: MouseEvent, room: Room): void {
    event.stopPropagation()
    const actions: Action[] = [
      {
        label: plugin.string.EnterRoom,
        icon: plugin.icon.EnterRoom,
        action: async () => {
          openRoom(room)
        }
      }
    ]
    if (canManageRooms) {
      actions.push({
        label: ui.string.Settings,
        icon: ui.icon.Gear,
        action: async () => {
          await showRoomSettings(room)
        }
      })
    }
    showPopup(Menu, { actions }, eventToHTMLElement(event))
  }
</script>

{#each $officeFloors as floor (floor._id)}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="floor"
    on:dragover|preventDefault
    on:drop|preventDefault={() => {
      dropOnFloor(floor._id)
    }}
  >
    <NavGroup
      _id={floor._id}
      title={floor.name}
      categoryName={`love-floor-${floor._id}`}
      collapsedPrefix="love-floor"
      isFold
      type="selectable-header"
      selected={$officeView === 'floor' && floor._id === $currentFloor}
      draggable
      on:click={() => {
        openFloor(floor._id)
      }}
      on:dragstart={() => (drag = floor._id)}
    >
      <!-- The header is a button of its own: without this the click would also pick the floor. -->
      <svelte:fragment slot="extra">
        {#if canManageRooms}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="flex" on:click|stopPropagation>
            <IconButton
              icon={ui.icon.Plus}
              kind="ghost"
              size="min"
              tooltip={{ label: plugin.string.AddRoom }}
              on:click={(e) => {
                addRoom(e, floor._id)
              }}
            />
          </div>
        {/if}
      </svelte:fragment>
      <div class="rooms">
        {#each roomsOf(floor._id) as room (room._id)}
          <!-- An unassigned office seat has no name of its own; the row still has to be readable. -->
          {@const roomName = names.get(room._id) ?? room.name}
          {@const owner = ownerOf(room)}
          {@const live = countOf(room._id) !== null}
          <NavItem
            _id={room._id}
            icon={plugin.icon.Love}
            label={roomName === '' ? plugin.string.Room : undefined}
            title={roomName === '' ? undefined : roomName}
            subTitle={personsOf(room._id)}
            count={countOf(room._id)}
            on:click={() => {
              openRoom(room)
            }}
          >
            <svelte:fragment slot="icon">
              {#if owner !== undefined}
                <Avatar person={owner} size="x-small" />
              {:else}
                <Icon icon={plugin.icon.Love} size="x-small" />
              {/if}
            </svelte:fragment>
            <svelte:fragment slot="extra">
              {#if live}<span class="live" />{/if}
            </svelte:fragment>
            <svelte:fragment slot="actions">
              {#if canManageRooms}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div class="flex" on:click|stopPropagation>
                  <IconButton
                    icon={ui.icon.DotsVertical}
                    kind="ghost"
                    size="min"
                    tooltip={{ label: view.string.MoreActions }}
                    on:click={(e) => {
                      showRoomMenu(e, room)
                    }}
                  />
                </div>
              {/if}
            </svelte:fragment>
          </NavItem>
        {/each}
      </div>
    </NavGroup>
  </div>
{/each}

<style lang="scss">
  .floor {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* Rooms sit one step under the floor title: the row starts where the title's label does, so the
     avatar of a room reads as a child of that floor. 1.75rem is the header's own left padding
     (0.5rem) plus the room row's inner padding, measured against the rendered navigator. */
  .rooms {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding-left: 1.75rem;
  }

  /* A call is in progress in this room - the same signal the grid gives by showing people. */
  .live {
    flex-shrink: 0;
    margin: 0 var(--spacing-1);
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: var(--theme-status-online, #34c759);
  }
</style>
