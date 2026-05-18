import { AccountRole, generateId, getCurrentAccount, type Ref, type Space, type AccountUuid } from '@hcengineering/core'
import love, {
  getFreeRoomPlace,
  MeetingStatus,
  TranscriptionState,
  RecordingState,
  type Room,
  RoomType,
  isOffice,
  type MeetingMinutes
} from '@hcengineering/love'
import presentation, { getClient, onClient } from '@hcengineering/presentation'
import {
  getLiveKitEndpoint,
  getRoomName,
  liveKitClient,
  loveClient,
  navigateToMeetingMinutes,
  navigateToOfficeDoc
} from './utils'
import { get, writable } from 'svelte/store'
import { LoveServiceError } from './loveClient'
import {
  infos,
  myInfo,
  rooms,
  myConnectingSessionId,
  meetings,
  currentMeetingMinutes,
  waitForOfficeLoaded
} from './stores'
import { getCurrentEmployee, type Person } from '@hcengineering/contact'
import { getPersonByPersonRef } from '@hcengineering/contact-resources'
import { getMetadata } from '@hcengineering/platform'
import { sendInvites } from './invites'
import { lkIsConnecting, lkSessionConnected } from './liveKitClient'

export let currentMeetingRoom: Ref<Room> | undefined
export let currentMeeting: Ref<MeetingMinutes> | undefined

// True while the auto-reconnect routine (post page-refresh) is trying to
// take the LiveKit seat back. UI can show a banner / spinner.
export const reconnectingToMeeting = writable<boolean>(false)

// sessionStorage anchor — survives a single page refresh so the love client
// can resume the LiveKit session even after the server-side ParticipantInfo
// is gone (LK departureTimeout = 3s; a reload can outrun it).
const ACTIVE_MEETING_STORAGE_KEY = 'love.activeMeeting'
function rememberActiveMeeting (id: Ref<MeetingMinutes>): void {
  try {
    sessionStorage.setItem(ACTIVE_MEETING_STORAGE_KEY, id)
  } catch {}
}
function forgetActiveMeeting (): void {
  try {
    sessionStorage.removeItem(ACTIVE_MEETING_STORAGE_KEY)
  } catch {}
}
export function recallActiveMeeting (): Ref<MeetingMinutes> | undefined {
  try {
    return (sessionStorage.getItem(ACTIVE_MEETING_STORAGE_KEY) as Ref<MeetingMinutes>) ?? undefined
  } catch {
    return undefined
  }
}

export async function createMeeting (room: Room, meeting?: MeetingMinutes): Promise<MeetingMinutes | undefined> {
  const client = getClient()
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)

  if (isOffice(room) && room.person != null && room.person !== currentPerson?._id) {
    await sendInvites([room.person])
    return
  }

  // TODO: We need server atomic operation to create a meeting minutes with pending, or create one
  meeting =
    meeting ??
    (await client.findOne(love.class.MeetingMinutes, {
      roomId: room._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    }))

  if (meeting !== undefined) {
    await joinMeeting(meeting)
    return meeting
  }

  // Check if there are participants in the room but no accessible meeting
  // This means a private meeting is in progress and we don't have access
  const roomParticipants = get(infos).filter((p) => p.room === room._id)
  if (roomParticipants.length > 0) {
    return
  }

  // Create MeetingMinutes document before connecting to LiveKit (atomic apply -> Pending)
  meeting = await createMeetingDocument(room)
  await connectToMeeting(meeting, room)
  return meeting
}

// Set while the user explicitly leaves the meeting. Blocks the
// reconnect watcher between `liveKitClient.disconnect()` and the
// moment the server removes our ParticipantInfo — otherwise the
// subscribe-fire on `currentMeetingMinutes` (still pointing at the
// just-left meeting via stale PI) would race us back into the room.
let leavingMeeting = false

export async function leaveMeeting (): Promise<void> {
  // If we're still in the process of connecting, don't disconnect
  if (get(lkIsConnecting)) {
    return
  }

  // Drop the reconnect anchor and raise the leave-guard BEFORE touching
  // LiveKit. The disconnect handler clears `lkSessionConnected`, which
  // wakes the `currentMeetingMinutes.subscribe` watcher — without the
  // guard it'd re-enter `connectToMeeting` using the still-live PI.
  leavingMeeting = true
  forgetActiveMeeting()
  try {
    // Disconnect from LiveKit. The love service receives a
    // `participant_left` webhook and removes our ParticipantInfo there —
    // clients must NOT delete documents directly. When the meeting owner
    // leaves their own office, the service also closes the LiveKit room
    // (`leaveMeetingAsOwner` → RoomService.deleteRoom) which forces every
    // other participant to disconnect, generating their own
    // `participant_left` webhooks.
    await liveKitClient.disconnect()
    currentMeeting = undefined
    currentMeetingRoom = undefined
  } finally {
    leavingMeeting = false
  }
}

export async function joinMeeting (meeting: MeetingMinutes): Promise<void> {
  if (meeting.roomId == null) return
  const room = getRoomById(meeting.roomId)
  const me = getCurrentAccount()
  const isWorkspaceOwner = me.role === AccountRole.Owner

  if (meeting.private && !meeting.members.includes(me.uuid)) {
    // Workspace owner has full access to every space (SpaceSecurityMiddleware
    // bypasses the owner-only checks for AccountRole.Owner), so they may
    // self-add to the meeting members and walk straight in — they are
    // effectively a trusted moderator across the workspace. Everyone else
    // bails out and (if the UI offered Connect) gets the knock flow instead.
    if (!isWorkspaceOwner) return
    try {
      const client = getClient()
      await client.update(meeting, { $push: { members: me.uuid } })
      meeting = { ...meeting, members: [...meeting.members, me.uuid] }
    } catch (err) {
      console.warn('Failed to self-add workspace owner to private meeting members', err)
      return
    }
  }

  const isGuest = me.role === AccountRole.Guest

  // Check if this is the user's own office - allow direct connection without knock
  const isOwnOffice = room !== undefined && isOffice(room) && room.person === getCurrentEmployee()

  const officePerson = room != null ? (isOffice(room) ? room.person : undefined) : undefined
  if (isGuest && officePerson != null && !isOwnOffice) {
    await sendInvites([officePerson], meeting._id)
    return
  }

  await connectToMeeting(meeting)
}

export async function joinOrCreateMeetingByInvite (meetingId: Ref<MeetingMinutes>): Promise<boolean> {
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
    return false
  }

  // After a knock is accepted the server pushes the knocker into the meeting's
  // members, but the membership write and the broadcast of the resulting
  // SecurityChange are not synchronous with the `status: 'accepted'` update
  // the knocker's client observes. The `/getToken` endpoint enforces
  // membership on private meetings, so the first attempt may race the
  // membership write and come back with 403. Retry with backoff before
  // surfacing the failure.
  let lastErr: LoveServiceError | undefined
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await connectToMeeting(meeting)
      return true
    } catch (err) {
      if (!(err instanceof LoveServiceError) || err.status !== 403) throw err
      lastErr = err
      await new Promise((resolve) => setTimeout(resolve, 250))
      // Re-fetch in case members propagated since the snapshot we have.
      const refreshed = await client.findOne(love.class.MeetingMinutes, { _id: meetingId })
      if (refreshed === undefined || refreshed.status === MeetingStatus.Finished) {
        // Meeting is gone — stop hammering.
        return false
      }
      meeting = refreshed
    }
  }
  console.warn(`joinOrCreateMeetingByInvite: connect failed after retries: ${lastErr?.message ?? 'unknown'}`)
  return false
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

async function connectToMeeting (mm: MeetingMinutes, room?: Room): Promise<void> {
  if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) {
    return
  }
  if (currentMeeting === mm._id) {
    return
  }

  if (currentMeeting !== undefined) {
    await leaveMeeting()
  }

  currentMeeting = mm._id

  if (mm.roomId !== undefined) {
    room = room ?? (await getClient().findOne<Room>(love.class.Room, { _id: mm.roomId }))
    currentMeetingRoom = room?._id
  }

  await navigateToOfficeDoc(mm) // TODO: Select room?
  await moveToMeetingRoom(mm, room)

  const token = await loveClient.getRoomToken(mm)
  const wsURL = getLiveKitEndpoint()

  // Mark local session as connecting (prevents accidental disconnects while connecting)
  const sessionId = getMetadata(presentation.metadata.SessionId) ?? null
  myConnectingSessionId.set(sessionId)

  try {
    await liveKitClient.connect(wsURL, token, room?.type === RoomType.Video)
    await navigateToMeetingMinutes(mm)
  } catch (err: any) {
    console.error('[connectToMeeting] Error connecting:', err)
    // Ensure local connecting flag is cleared on error
    myConnectingSessionId.set(null)
    throw err
  }

  // Connection completed successfully: clear connecting flag and remember
  // the meeting so a page refresh can reconnect directly via /getToken.
  myConnectingSessionId.set(null)
  rememberActiveMeeting(mm._id)
}

async function moveToMeetingRoom (mm: MeetingMinutes, room?: Room): Promise<void> {
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)
  const client = getClient()
  const myParticipation = get(myInfo)
  if (mm === undefined || currentPerson == null) return

  if (myParticipation?.meeting === mm._id) return
  if (mm.roomId === undefined) return

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
      roomId: room._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    })
    if (meeting !== undefined) {
      return meeting
    }

    const me = getCurrentEmployee()
    const currentPerson = await getPersonByPersonRef(me)
    const myAccount = currentPerson?.personUuid

    // Use apply() to atomically create MeetingMinutes with Pending status
    const ops = client.apply(`create_meeting_${room._id}`)
    // Ensure no MeetingMinutes for this room exists at the time of commit
    ops.notMatch(love.class.MeetingMinutes, {
      roomId: room._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    })
    const title = await getNewMeetingTitle(room)
    const newMeetingId = generateId<MeetingMinutes>()
    await ops.createDoc(
      love.class.MeetingMinutes,
      newMeetingId as unknown as Ref<Space>,
      {
        name: title,
        description: '',
        private: room.startPrivate ?? false,
        archived: false,
        members: myAccount !== undefined ? [myAccount as unknown as AccountUuid] : [],
        owners: myAccount !== undefined ? [myAccount as unknown as AccountUuid] : [],
        descriptionRef: null,
        summary: null,
        roomId: room._id,
        status: MeetingStatus.Pending,
        transcriptionState: TranscriptionState.NotStarted,
        recordingState: RecordingState.NotStarted,
        language: room.language,
        startWithRecording: room.startWithRecording ?? false,
        startWithTranscription: room.startWithTranscription ?? false
      },
      newMeetingId
    )
    try {
      await ops.commit()
      const meeting = await client.findOne(love.class.MeetingMinutes, { _id: newMeetingId })
      if (meeting !== undefined) {
        return meeting
      }
    } catch (err: any) {
      // Concurrent creation happened — pick the existing one (if available)
      const existing = await client.findOne(love.class.MeetingMinutes, {
        roomId: room._id,
        status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
      })
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

/**
 * Auto-reconnect to LiveKit after page refresh.
 *
 * Source of truth is the server-side ParticipantInfo: if a row exists for me
 * with a non-undefined `meeting`, the LiveKit session was alive when the
 * page reloaded. We re-issue `connectToMeeting` to take over the seat.
 * The old PI (stale sessionId) is rewritten by moveToMeetingRoom; the dead
 * LK participant is cleaned up by the `participant_left` webhook once
 * LiveKit's departureTimeout fires.
 *
 * Guards against loops: only fires when we are not already connecting / not
 * already connected, and only for meetings that are still Active/Pending.
 */
/**
 * Auto-reconnect after page refresh. Uses two complementary sources:
 *   1) sessionStorage anchor — meeting id remembered by `connectToMeeting`
 *      and cleared in `leaveMeeting`. Survives a refresh in the same tab.
 *      Other tabs have their own sessionStorage so the multi-tab guard is
 *      automatic.
 *   2) Server-side ParticipantInfo — if it survived (LK departureTimeout
 *      hasn't fired yet), `currentMeetingMinutes` resolves immediately and
 *      we use it directly.
 *
 * In both cases we hand off to `connectToMeeting`, which asks `/getToken` —
 * the server will reject (or `listRooms` will be empty) for a finished
 * meeting, at which point we drop the anchor.
 */
let reconnecting = false
export async function reconnectToCurrentMeeting (): Promise<void> {
  if (reconnecting) return
  if (leavingMeeting) return
  if (get(lkSessionConnected) || get(lkIsConnecting)) return
  if (currentMeeting !== undefined) return
  if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) return

  // Prefer the live PI (server-side source of truth) when it's there.
  let mm: MeetingMinutes | undefined = get(currentMeetingMinutes)
  if (mm === undefined) {
    const remembered = recallActiveMeeting()
    if (remembered === undefined) return
    const allMeetings = get(meetings)
    // `meetings` query may still be loading. Wait silently for the next
    // store tick instead of dropping the anchor — losing it here means
    // a 30s server-round-trip on second-chance reconnect via PI.
    if (allMeetings.length === 0) return
    mm = allMeetings.find((m) => m._id === remembered)
    if (mm === undefined) {
      // MeetingMinutes is finished or otherwise filtered out of the store
      // (`status !== Finished` clause). Anchor is stale — drop it.
      forgetActiveMeeting()
      return
    }
  }

  if (mm.status !== MeetingStatus.Active && mm.status !== MeetingStatus.Pending) {
    forgetActiveMeeting()
    return
  }

  reconnecting = true
  reconnectingToMeeting.set(true)
  try {
    const room = mm.roomId !== undefined ? getRoomById(mm.roomId) : undefined
    await connectToMeeting(mm, room)
  } catch (err) {
    console.warn('[reconnectToCurrentMeeting] failed', err)
    forgetActiveMeeting()
  } finally {
    reconnecting = false
    reconnectingToMeeting.set(false)
  }
}

/**
 * User-initiated cancel of the reconnect attempt. Drops the storage
 * anchor; if connect is in-flight LiveKit timeout will surface as a
 * normal failure and the watcher's catch branch will swallow it.
 */
export function cancelReconnect (): void {
  forgetActiveMeeting()
  reconnectingToMeeting.set(false)
}

onClient(() => {
  void waitForOfficeLoaded().then(() => {
    void reconnectToCurrentMeeting()
    // Subscribe to both PI-derived store and meetings store: either may
    // populate after officeLoaded resolves (LiveQuery snapshots arrive
    // asynchronously). Loop guarded by `reconnecting`/`currentMeeting`.
    currentMeetingMinutes.subscribe(() => {
      void reconnectToCurrentMeeting()
    })
    meetings.subscribe(() => {
      if (recallActiveMeeting() !== undefined) {
        void reconnectToCurrentMeeting()
      }
    })
  })
})
