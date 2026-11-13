<script lang="ts">
  import type { Class, Data, Ref } from '@hcengineering/core'
  import core, { generateId, type Doc } from '@hcengineering/core'
  import contact, { type Employee } from '@hcengineering/contact'
  import { AssigneeBox } from '@hcengineering/contact-resources'
  import presentation from '@hcengineering/presentation'
  import type { Floor, Office, Room } from '@hcengineering/love'
  import { getFreePosition, RoomType } from '@hcengineering/love'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import setting, { type OfficeSettings } from '@hcengineering/setting'
  import type { DropdownIntlItem } from '@hcengineering/ui'
  import { Button, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import { rooms, selectedFloor } from '../stores'

  export let floor: Ref<Floor>

  const dispatch = createEventDispatcher()

  type TypeIds = 'meetingRoom' | 'teamRoom' | 'office'

  interface Item extends DropdownIntlItem {
    id: TypeIds
    type: RoomType
    _class: Ref<Class<Room>>
  }

  const items: Item[] = [
    {
      id: 'meetingRoom',
      label: love.string.MeetingRoom,
      type: RoomType.Video,
      _class: love.class.Room
    },
    {
      id: 'teamRoom',
      label: love.string.TeamRoom,
      type: RoomType.Audio,
      _class: love.class.Room
    },
    {
      id: 'office',
      label: love.string.Office,
      type: RoomType.Video,
      _class: love.class.Office
    }
  ] as const

  // An office is a seat of a person: created without one it is an empty rectangle nobody can be
  // called in, so the employee is picked before the document is written, not after.
  let officePerson: Ref<Employee> | null = null
  let askOfficeOwner = false

  let creatingRoom = false
  async function createRoom (value: TypeIds): Promise<void> {
    if (creatingRoom) return
    creatingRoom = true
    try {
      const val = items.find((i) => i.id === value)
      if (val === undefined) return
      const client = getClient()
      const floorRooms = $rooms.filter((r) => r.floor === floor)
      const pos = getFreePosition(floorRooms, 2, 1)
      const _id = generateId<Room>()

      // Get workspace settings for Video rooms
      let defaultTranscription = false
      let defaultRecording = false
      let defaultPrivate = false
      if (val.type === RoomType.Video && val._class !== love.class.Office) {
        const officeSettings = await client.findAll<OfficeSettings>(setting.class.OfficeSettings, {})
        if (officeSettings !== undefined && officeSettings.length > 0) {
          defaultTranscription = officeSettings[0].defaultStartWithTranscription ?? false
          defaultRecording = officeSettings[0].defaultStartWithRecording ?? false
          defaultPrivate = officeSettings[0].defaultStartPrivate ?? false
        }
      }
      const data: Data<Room> = {
        floor,
        name: val._class === love.class.Office ? '' : await translate(val.label, {}),
        x: pos.x,
        y: pos.y,
        width: 2,
        height: 1,
        type: val.type,
        language: 'en',
        startWithTranscription: defaultTranscription,
        startWithRecording: defaultRecording,
        startPrivate: val._class === love.class.Office ? true : defaultPrivate,
        description: null
      }
      if (val._class === love.class.Office) {
        ;(data as Data<Office>).person = officePerson
      }
      await client.createDoc(val._class, core.space.Workspace, data, _id)
      dispatch('close')
    } finally {
      creatingRoom = false
    }
  }

  let creatingFloor = false
  async function createFloor (): Promise<void> {
    if (creatingFloor) return
    creatingFloor = true
    try {
      const client = getClient()
      const name = await translate(love.string.Floor, {})
      const _id = await client.createDoc(love.class.Floor, core.space.Workspace, { name })
      selectedFloor.set(_id)
      dispatch('close')
    } finally {
      creatingFloor = false
    }
  }
</script>

<div class="antiPopup room-popup">
  {#if askOfficeOwner}
    <div class="office-step" data-id="office-owner-step">
      <span class="step-label"><Label label={contact.string.Person} /></span>
      <div class="w-full">
        <!-- A field of the dialog, not a small ghost button: full width, regular border, name on the
             left. Without these the picker collapsed to a 87px chip reading "Person". -->
        <AssigneeBox
          _class={contact.mixin.Employee}
          label={contact.string.Person}
          placeholder={contact.string.Person}
          avatarSize="small"
          size="medium"
          kind="regular"
          width="100%"
          justify="left"
          showNavigate={false}
          value={officePerson}
          allowDeselect={true}
          on:change={(ev) => {
            officePerson = ev.detail
          }}
        />
      </div>
      <div class="step-actions">
        <Button
          label={presentation.string.Cancel}
          kind="secondary"
          on:click={() => {
            askOfficeOwner = false
          }}
        />
        <Button
          label={presentation.string.Create}
          kind="primary"
          loading={creatingRoom}
          on:click={() => void createRoom('office')}
        />
      </div>
    </div>
  {:else}
    <div class="room-menu">
      {#each items as item}
        <Button
          label={item.label}
          kind="ghost"
          size="medium"
          width={'100%'}
          justify="left"
          loading={creatingRoom}
          on:click={() => {
            if (item.id === 'office') {
              askOfficeOwner = true
              return
            }
            void createRoom(item.id)
          }}
        />
      {/each}
      <Button
        label={love.string.Floor}
        kind="ghost"
        size="medium"
        width={'100%'}
        justify="left"
        loading={creatingFloor}
        on:click={createFloor}
      />
    </div>
  {/if}
</div>

<style lang="scss">
  /* A list of choices, not a row of buttons: one option per line, 4px apart, inside the popup's own
     padding. A step (the office owner) is a column with its actions pushed to the right. */
  .room-popup {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 20rem;
    padding: 0.5rem;
  }

  .room-menu {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .office-step {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.25rem;
  }

  /* A long name is cut with an ellipsis inside the field instead of running over its border. */
  .office-step :global(.flex-presenter) {
    min-width: 0;
  }

  .office-step :global(.flex-presenter .overflow-label) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-label {
    font-size: 0.8125rem;
    color: var(--theme-content-color);
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
