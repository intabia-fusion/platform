import core, { AccountRole, getCurrentAccount, type Ref } from '@hcengineering/core'
import love, {
  getFreeRoomPlace,
  MeetingStatus,
  TranscriptionState,
  RecordingState,
  type Room,
  RoomType,
  isOffice,
  RoomAccess,
  type MeetingMinutes
} from '@hcengineering/love'
import presentation, { getClient } from '@hcengineering/presentation'
import {
  closeMeetingMinutes,
  getLiveKitEndpoint,
  getRoomName,
  liveKitClient,
  loveClient,
  navigateToMeetingMinutes,
  navigateToOfficeDoc
} from './utils'
import { get } from 'svelte/store'
import { infos, myInfo, myOffice, rooms, myConnectingSessionId, meetings } from './stores'
import { getCurrentEmployee, type Person } from '@hcengineering/contact'
import { getPersonByPersonRef } from '@hcengineering/contact-resources'
import { getMetadata } from '@hcengineering/platform'
import { sendInvites, unsubscribeFromIncomingInvites } from './invites'

export let currentMeetingRoom: Ref<Room> | undefined
export let currentMeeting: Ref<MeetingMinutes> | undefined

export async function createMeeting (room: Room): Promise<MeetingMinutes | undefined> {
  if (room.access === RoomAccess.DND) {
    return
  }

  const client = getClient()
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)

  if (isOffice(room) && room.person != null && room.person !== currentPerson?._id) {
    await sendInvites([room.person])
    return
  }

  // TODO: We need server atomic operation to create a meeting minutes with pending, or create one
  let meeting = await client.findOne(love.class.MeetingMinutes, {
    attachedTo: room._id,
    status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
  })

  if (meeting !== undefined) {
    await joinMeeting(meeting)
    return meeting
  }

  // Create MeetingMinutes document before connecting to LiveKit (atomic apply -> Pending)
  meeting = await createMeetingDocument(room)
  await connectToMeeting(meeting)
  return meeting
}

export async function leaveMeeting (): Promise<void> {
  // If we're still in the process of connecting, don't disconnect
  if (liveKitClient.isConnecting) {
    return
  }

  const client = getClient()

  const currentParticipationInfo = get(myInfo)
  const office = get(myOffice)
  if (currentParticipationInfo === undefined) {
    // If there was no active ParticipantInfo, ensure we still disconnect/cleanup state
    await liveKitClient.disconnect()
    unsubscribeFromIncomingInvites()
    closeMeetingMinutes()
    currentMeeting = undefined
    currentMeetingRoom = undefined
    return
  }

  if (office === undefined) {
    await client.update(currentParticipationInfo, { room: love.ids.Reception, x: 0, y: 0 })
  } else {
    if (currentParticipationInfo.room !== office._id) {
      await client.update(currentParticipationInfo, { room: office._id, x: 0, y: 0 })
    } else {
      // kick all participants in case of own office
      const allRooms = get(rooms)
      const participantsInfo = get(infos)
      const otherParticipants = participantsInfo.filter((p) => p.room === office._id && p !== currentParticipationInfo)
      for (const participantInfo of otherParticipants) {
        const participantOffice = allRooms.find((r) => isOffice(r) && r.person === participantInfo.person)
        await client.update(participantInfo, { room: participantOffice?._id ?? love.ids.Reception, x: 0, y: 0 })
      }
    }
  }
  await liveKitClient.disconnect()
  closeMeetingMinutes()
  currentMeeting = undefined
  currentMeetingRoom = undefined
}

export async function joinMeeting (meeting: MeetingMinutes): Promise<void> {
  const room = getRoomById(meeting.attachedTo as Ref<Room>)
  if (meeting.access === RoomAccess.DND) return

  const isGuest = getCurrentAccount().role === AccountRole.Guest

  // Check if this is the user's own office - allow direct connection without knock
  const isOwnOffice = room !== undefined && isOffice(room) && room.person === getCurrentEmployee()

  const officePerson = room != null ? (isOffice(room) ? room.person : undefined) : undefined
  if ((isGuest || (meeting.access === RoomAccess.Knock && !isOwnOffice)) && officePerson != null && !isOwnOffice) {
    await sendInvites([officePerson], meeting._id)
    return
  }

  await connectToMeeting(meeting)
}

export async function joinOrCreateMeetingByInvite (meetingId: Ref<MeetingMinutes>): Promise<void> {
  const client = getClient()

  // Retry finding meeting - it may take time to propagate
  let meeting: MeetingMinutes | undefined = get(meetings).find((it) => it._id === meetingId)
  let attempts = 0
  const maxAttempts = 20
  const delay = 100 // ms

  while (attempts < maxAttempts) {
    if (meeting === undefined) {
      meeting = await client.findOne(love.class.MeetingMinutes, { _id: meetingId })
    }

    if (meeting !== undefined) {
      break
    }

    attempts++
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  if (meeting === undefined) {
    console.error('[joinOrCreateMeetingByInvite] MeetingMinutes not found after all retries', { meetingId })
    return
  }

  await connectToMeeting(meeting)
}

export async function kick (person: Ref<Person>): Promise<void> {
  // TODO: Need to rework a logic to kick a person from a personal meeting.
  const client = getClient()
  const allRooms = get(rooms)
  const participantsInfo = get(infos)
  const participantInfo = participantsInfo.find((p) => p.person === person)
  if (participantInfo === undefined) return
  const participantOffice = allRooms.find((r) => isOffice(r) && r.person === person)
  await client.update(participantInfo, { room: participantOffice?._id ?? love.ids.Reception, x: 0, y: 0 })
}

async function connectToMeeting (mm: MeetingMinutes): Promise<void> {
  console.log('[connectToMeeting] Called with meeting:', mm._id)
  if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) {
    console.log('[connectToMeeting] Blocked: ReadOnlyGuest')
    return
  }
  if (currentMeeting === mm._id) {
    console.log('[connectToMeeting] Already in this meeting, returning')
    return
  }

  if (currentMeeting !== undefined) {
    console.log('[connectToMeeting] Leaving current meeting first:', currentMeeting)
    await leaveMeeting()
  }

  currentMeeting = mm._id

  const room = await getClient().findOne<Room>(mm.attachedToClass, { _id: mm.attachedTo as Ref<Room> })
  currentMeetingRoom = room?._id
  console.log('[connectToMeeting] Found room:', room?._id, room?.name)

  await navigateToOfficeDoc(mm) // TODO: Select room?
  console.log('[connectToMeeting] Navigated to office doc')
  await moveToMeetingRoom(mm, room)
  console.log('[connectToMeeting] Moved to meeting room')

  // Resolve current person so we can cleanup pending entries after connect
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)
  if (currentPerson == null) {
    console.log('[connectToMeeting] No current person, returning')
    return
  }
  console.log('[connectToMeeting] Getting room token...')
  const token = await loveClient.getRoomToken(mm)
  const wsURL = getLiveKitEndpoint()
  console.log('[connectToMeeting] Got token, wsURL:', wsURL)

  // Mark local session as connecting (prevents accidental disconnects while connecting)
  const sessionId = getMetadata(presentation.metadata.SessionId) ?? null
  myConnectingSessionId.set(sessionId)

  try {
    console.log('[connectToMeeting] Connecting to LiveKit...')
    await liveKitClient.connect(wsURL, token, room?.type === RoomType.Video)
    console.log('[connectToMeeting] LiveKit connected, navigating to meeting minutes...')
    await navigateToMeetingMinutes(mm)
    console.log('[connectToMeeting] Navigation complete')
  } catch (err: any) {
    console.error('[connectToMeeting] Error connecting:', err)
    // Ensure local connecting flag is cleared on error
    myConnectingSessionId.set(null)
    throw err
  }

  // Connection completed successfully: clear connecting flag
  myConnectingSessionId.set(null)
  console.log('[connectToMeeting] Connection completed successfully')
}

async function moveToMeetingRoom (mm: MeetingMinutes, room?: Room): Promise<void> {
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)
  const client = getClient()
  const myParticipation = get(myInfo)
  if (mm === undefined || currentPerson == null) return

  if (myParticipation?.meeting === mm._id) return
  if (mm.attachedTo === undefined) return

  const roomParticipants = get(infos).filter((p) => p.meeting === mm._id)
  let place: { x: number, y: number } | undefined
  if (room !== undefined) {
    place = getFreeRoomPlace(room, roomParticipants, me)
  }
  const sessionId = getMetadata(presentation.metadata.SessionId) ?? null

  const currentInfo = get(myInfo)
  if (currentInfo !== undefined) {
    // Update existing ParticipantInfo (created by server via webhook)
    await client.diffUpdate(currentInfo, {
      x: place?.x ?? 0,
      y: place?.y ?? 0,
      meeting: mm._id,
      room: room?._id,
      sessionId
    })
  }
  // ParticipantInfo creation is handled by the server when it receives
  // the participant_joined webhook from LiveKit. Client only updates
  // position/room if ParticipantInfo already exists.
}

async function createMeetingDocument (room: Room): Promise<MeetingMinutes> {
  const client = getClient()

  while (true) {
    // First, check if there is an Active or Pending meeting already
    const meeting = await client.findOne(love.class.MeetingMinutes, {
      attachedTo: room._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    })
    if (meeting !== undefined) {
      return meeting
    }

    // Use apply() to atomically create MeetingMinutes with Pending status
    const ops = client.apply(`create_meeting_${room._id}`)
    // Ensure no MeetingMinutes for this room exists at the time of commit
    ops.notMatch(love.class.MeetingMinutes, {
      attachedTo: room._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    })
    const newMeetingId = await ops.addCollection(
      love.class.MeetingMinutes,
      core.space.Workspace,
      room._id,
      love.class.Room,
      'meetings',
      {
        description: null,
        status: MeetingStatus.Pending,
        transcriptionState: TranscriptionState.NotStarted,
        recordingState: RecordingState.NotStarted,
        title: await getNewMeetingTitle(room),
        language: room.language,
        access: room.access
      }
    )
    try {
      await ops.commit()
      const meeting = await client.findOne(love.class.MeetingMinutes, { _id: newMeetingId })
      if (meeting !== undefined) {
        return meeting
      }
    } catch (err: any) {
      // Concurrent creation happened — pick the existing one (if available)
      const existing = await client.findOne(love.class.MeetingMinutes, { attachedTo: room._id })
      if (existing !== undefined) return existing
      throw err
    }
    // Retry with a delay
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function getNewMeetingTitle (room: Room): Promise<string> {
  const date = new Date()
    .toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    .replace(',', ' at')
  return `${await getRoomName(room)} ${date}`
}

function getRoomById (roomId: Ref<Room>): Room | undefined {
  const allRooms = get(rooms)
  return allRooms.find((p) => p._id === roomId)
}
