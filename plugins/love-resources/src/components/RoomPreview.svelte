<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { getCurrentEmployee, Person } from '@hcengineering/contact'
  import {
    Avatar,
    myEmployeeStore,
    getPersonByPersonRef,
    getPersonByPersonRefStore,
    statusByUserStore
  } from '@hcengineering/contact-resources'
  import { ParticipantInfo, Room, RoomAccess, RoomType, MeetingStatus, isOffice, Office } from '@hcengineering/love'
  import { Icon, Label, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { getClient } from '@hcengineering/presentation'
  import { openDoc } from '@hcengineering/view-resources'

  import love from '../plugin'
  import { myInfo, myOffice, selectedRoomPlace, currentRoom, currentMeetingMinutes, infos } from '../stores'
  import { getRoomLabel } from '../utils'
  import { IntlString } from '@hcengineering/platform'
  import { lkSessionConnected } from '../liveKitClient'
  import { AccountUuid, Ref } from '@hcengineering/core'
  // import RoomLanguage from './RoomLanguage.svelte'
  import PersonActionPopup from './PersonActionPopup.svelte'

  export let room: Room
  export let info: ParticipantInfo[]
  export let preview: boolean = false
  export let hovered: boolean = false

  const dispatch = createEventDispatcher()

  const me = getCurrentEmployee()
  $: myName = $myEmployeeStore?.name

  let hoveredRoomX: number | undefined = undefined
  let hoveredRoomY: number | undefined = undefined

  let roomLabel: IntlString
  $: {
    void getRoomLabel(room).then((label) => {
      roomLabel = label
    })
  }

  $: disabled = room._class === love.class.Office && info.length === 0

  async function getPerson (info: Ref<Person> | undefined): Promise<Person | undefined> {
    if (info === undefined) {
      return
    }

    return (await getPersonByPersonRef(info)) ?? undefined
  }

  function getPersonInfo (y: number, x: number, info: ParticipantInfo[]): Omit<ParticipantInfo, 'meeting'> | undefined {
    return info.find((p) => p.x === x && p.y === y)
  }

  function mouseEnter (): void {
    hovered = true
    dispatch('hover', { name: roomLabel })
  }

  function mouseLeave (): void {
    hovered = false
  }

  async function openRoom (x: number, y: number): Promise<void> {
    const client = getClient()
    const hierarchy = client.getHierarchy()
    if ($lkSessionConnected && $currentRoom?._id === room._id) {
      let meeting = $currentMeetingMinutes
      if (meeting?.attachedTo !== room._id || meeting?.status !== MeetingStatus.Active) {
        meeting = await client.findOne(love.class.MeetingMinutes, {
          attachedTo: room._id,
          status: MeetingStatus.Active
        })
      }
      if (meeting === undefined) {
        await openDoc(hierarchy, room)
      } else {
        await openDoc(hierarchy, meeting)
      }
    } else {
      selectedRoomPlace.set({ _id: room._id, x, y })
      await openDoc(hierarchy, room)
    }
  }

  async function placeClickHandler (e: MouseEvent, x: number, y: number): Promise<void> {
    e.stopPropagation()
    e.preventDefault()

    console.log('[placeClickHandler]', {
      x,
      y,
      isOffice: isOffice(room),
      shouldShowAvatar,
      roomPersonId: roomPerson?._id,
      me,
      myInfoRoom: $myInfo?.room,
      roomId: room._id
    })

    // Get person at this position
    const personInfo = getPersonInfo(y, x, info)
    if (personInfo !== undefined) {
      const person = await getPerson(personInfo.person)
      if (person !== undefined) {
        if ($myInfo === undefined || (person._id === me && $myInfo?.room === room._id)) return
        showPopup(PersonActionPopup, { room, person: person._id }, eventToHTMLElement(e))
        return
      }
    }

    // Check if clicking on room owner avatar (shown in office at position 0,0)
    if (isOffice(room) && x === 0 && y === 0 && shouldShowAvatar && roomPerson != null) {
      const isMe = roomPerson._id === me && $myInfo?.room === room._id
      console.log('[placeClickHandler] Office click:', {
        isMe,
        roomPersonId: roomPerson._id,
        me,
        myInfoRoom: $myInfo?.room
      })
      if (isMe) {
        await openRoom(x, y)
        return
      }
      showPopup(PersonActionPopup, { room, person: roomPerson._id }, eventToHTMLElement(e))
      return
    }

    // If no person at this position, open the room
    console.log('[placeClickHandler] Opening room')
    await openRoom(x, y)
  }

  $: extraRow = calcExtraRows(hovered, room, info, $myInfo)

  function calcExtraRows (
    hovered: boolean,
    room: Room,
    info: ParticipantInfo[],
    myInfo: ParticipantInfo | undefined
  ): number {
    if (!hovered) return 0
    let maxX = info.reduce((acc, p) => {
      acc = Math.max(acc, p.x)
      return acc
    }, 0)
    maxX++
    let init = maxX > room.width ? maxX - room.width : 0

    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (info.find((p) => p.x === x && p.y === y) === undefined) {
          return init
        }
      }
    }
    if (myInfo?.room !== room._id) {
      init++
      while (init < 5) {
        const x = room.width + init
        for (let y = 0; y < room.height; y++) {
          if (info.find((p) => p.x === x && p.y === y) === undefined) {
            return init
          }
        }
        init++
      }
    }
    return init
  }

  async function handleClick (): Promise<void> {
    await openRoom(0, 0)
  }

  // Create a store for the office person that reacts to room.person changes
  let roomPerson: Person | null

  $: if (isOffice(room) && room.person != null) {
    void getPersonByPersonRef(room.person).then((res) => {
      roomPerson = res
    })
  } else {
    roomPerson = null
  }

  // Check if this is the user's current room (where they are in ParticipantInfo)
  $: isUserCurrentRoom = $infos.some((it) => it.person === roomPerson?._id && it.room === room._id)

  // Show avatar for office owner if:
  // 1. It's an office AND
  // 2. There's a person assigned to it
  $: shouldShowAvatar = isOffice(room) && room.person != null

  // Check if user is online (for styling)
  $: isUserOnline =
    roomPerson?.personUuid != null
      ? ($statusByUserStore.get(roomPerson.personUuid as AccountUuid)?.online ?? false)
      : false

  // User is offline if assigned but not online and not currently in the room
  $: isUserOffline = roomPerson != null && !isUserOnline && !isUserCurrentRoom

  // Debug logging for office presence
  $: {
    const isOfficeCheck = isOffice(room)
    const hasPerson = isOfficeCheck ? (room as Office).person != null : false
    if (isOfficeCheck && hasPerson) {
      console.log('[RoomPreview Debug]', {
        roomId: room._id,
        roomName: room.name,
        roomClass: room._class,
        isOffice: isOfficeCheck,
        hasPerson,
        shouldShowAvatar,
        roomPersonLoaded: roomPerson != null,
        roomPersonId: roomPerson?._id,
        roomPersonName: roomPerson?.name,
        roomPersonUuid: roomPerson?.personUuid,
        statusStoreSize: $statusByUserStore.size,
        isOnline:
          roomPerson?.personUuid != null
            ? $statusByUserStore.get(roomPerson.personUuid as AccountUuid)?.online
            : undefined
      })
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<!-- svelte-ignore a11y-mouse-events-have-key-events -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  class="floorGrid-room"
  class:hovered
  class:disabled
  class:myOffice={$myOffice?._id === room._id}
  style:--huly-floor-roomWidth={room.width + extraRow}
  style:--huly-floor-roomHeight={room.height}
  style:grid-column={`${room.x + 2} / span ${room.width + extraRow}`}
  style:grid-row={`${room.y + 2} / span ${room.height}`}
  style:grid-template-columns={`repeat(${room.width + extraRow}, 1fr)`}
  style:grid-template-rows={`repeat(${room.height}, 1fr)`}
  style:aspect-ratio={`${room.width + extraRow} / ${room.height}`}
  on:mouseover|stopPropagation
  on:mouseenter|stopPropagation={mouseEnter}
  on:mouseleave|stopPropagation={mouseLeave}
  on:click|stopPropagation={handleClick}
>
  {#each new Array(room.height) as _, y}
    {#each new Array(room.width + extraRow) as _, x}
      {@const personInfo = getPersonInfo(y, x, info)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div
        class="floorGrid-room__field"
        class:hovered={hoveredRoomX === x && hoveredRoomY === y}
        class:person={$myInfo?.room === room._id}
        on:mouseenter={() => {
          if ($myInfo?.room !== room._id) {
            hoveredRoomX = x
            hoveredRoomY = y
          }
        }}
        on:mouseout={() => {
          hoveredRoomX = undefined
          hoveredRoomY = undefined
        }}
        on:click={(e) => {
          placeClickHandler(e, x, y).catch(() => {
            // Ignore errors
          })
        }}
      >
        {#if personInfo === undefined && shouldShowAvatar && roomPerson != null && x === 0 && y === 0}
          <Avatar
            name={roomPerson.name}
            person={roomPerson}
            size={'large'}
            variant={'roundedRect'}
            adaptiveName
            grayscale={!isUserOnline}
          />
        {:else if personInfo !== undefined}
          {#await getPerson(personInfo.person) then person}
            {#if personInfo}
              <Avatar
                name={person?.name ?? personInfo.name}
                {person}
                size={'large'}
                showStatus={false}
                adaptiveName
                grayscale={!isUserOnline}
              />
            {:else if hoveredRoomX === x && hoveredRoomY === y}
              <Avatar
                name={myName}
                person={$myEmployeeStore}
                size={'large'}
                showStatus={false}
                adaptiveName
                grayscale={!isUserOnline}
              />
            {/if}
          {/await}
        {/if}
      </div>
    {/each}
  {/each}

  {#if !preview}
    <div class="floorGrid-room__header">
      <span class="overflow-label text-md flex-grow">
        <Label label={roomLabel} />
      </span>
      <!-- {#if !isOffice(room)}
        <RoomLanguage {room} />
      {/if} -->
      {#if room.access === RoomAccess.DND || room.type === RoomType.Video}
        <div class="flex-row-center flex-no-shrink h-full flex-gap-2">
          {#if room.access === RoomAccess.DND}
            <Icon icon={love.icon.DND} fill={'var(--bg-negative-default)'} size={'small'} />
          {/if}
          {#if room.type === RoomType.Video}
            <Icon icon={love.icon.CamEnabled} size={'small'} />
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
