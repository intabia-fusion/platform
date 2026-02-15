import aiBot from '@hcengineering/ai-bot'
import { connectMeeting, disconnectMeeting } from '@hcengineering/ai-bot-resources'
import { Analytics } from '@hcengineering/analytics'
import calendar, { type Event, type Schedule } from '@hcengineering/calendar'
import chunter from '@hcengineering/chunter'
import contact, { getName } from '@hcengineering/contact'
import core, {
  AccountRole,
  type Client,
  concatLink,
  type Data,
  type Doc,
  type DocumentQuery,
  getCurrentAccount,
  type Ref,
  type RelatedDocument,
  type Space,
  type TxOperations,
  type WithLookup
} from '@hcengineering/core'
import login from '@hcengineering/login'
import {
  isOffice,
  LoveEvents,
  loveId,
  type MeetingEventLink,
  type MeetingMinutes,
  type MeetingSchedule,
  type Room,
  type RoomMetadata,
  type UserMeetingInvite
} from '@hcengineering/love'
import { getEmbeddedLabel, getMetadata, getResource, translate, type IntlString } from '@hcengineering/platform'
import presentation, {
  copyTextToClipboard,
  type DocCreatePhase,
  getClient,
  type ObjectSearchResult
} from '@hcengineering/presentation'
import { closePanel, getCurrentLocation, navigate, panelstore, showPopup } from '@hcengineering/ui'
import { getCurrentLanguage } from '@hcengineering/theme'
import view from '@hcengineering/view'
import { getObjectLinkFragment } from '@hcengineering/view-resources'
import { type Widget, type WidgetTab } from '@hcengineering/workbench'
import { openWidget, openWidgetTab, sidebarStore, updateWidgetState } from '@hcengineering/workbench-resources'
import { isKrispNoiseFilterSupported, KrispNoiseFilter } from '@livekit/krisp-noise-filter'
import { BackgroundBlur, type BackgroundOptions, type ProcessorWrapper } from '@livekit/track-processors'
import {
  LocalAudioTrack,
  type LocalTrack,
  type LocalTrackPublication,
  LocalVideoTrack,
  type Room as LKRoom,
  RoomEvent,
  Track
} from 'livekit-client'
import { get, writable } from 'svelte/store'

import { getPersonByPersonRef } from '@hcengineering/contact-resources'
import MeetingMinutesSearchItem from './components/MeetingMinutesSearchItem.svelte'
import RoomSettingsPopup from './components/RoomSettingsPopup.svelte'
import love from './plugin'
import { $myPreferences, currentMeetingMinutes } from './stores'
import { getLiveKitClient } from './liveKitClient'
import { getLoveClient } from './loveClient'

export const liveKitClient = getLiveKitClient()
export const lk: LKRoom = liveKitClient.liveKitRoom

export const loveClient = getLoveClient()

export function setCustomCreateScreenTracks (value: () => Promise<Array<LocalTrack<Track.Kind>>>): void {
  lk.localParticipant.createScreenTracks = value
}

export const isRecording = writable<boolean>(false)
export const isTranscription = writable<boolean>(false)
export const isRecordingAvailable = writable<boolean>(false)
export const isFullScreen = writable<boolean>(false)
export const isShareWithSound = writable<boolean>(false)

export const krispProcessor = KrispNoiseFilter()
export let blurProcessor: ProcessorWrapper<BackgroundOptions> | undefined
let localVideo: LocalVideoTrack | undefined

try {
  blurProcessor = BackgroundBlur()
} catch (err) {
  console.log("Can't set blur processor", err)
}

async function setKrispProcessor (pub: LocalTrackPublication): Promise<void> {
  if (pub.track instanceof LocalAudioTrack) {
    if (!isKrispNoiseFilterSupported()) {
      console.warn('enhanced noise filter is currently not supported on this browser')
      return
    }
    try {
      // once instantiated the filter will begin initializing and will download additional resources
      console.log('enabling LiveKit enhanced noise filter')
      await pub.track.setProcessor(krispProcessor)
      await krispProcessor.setEnabled($myPreferences?.noiseCancellation ?? true)
    } catch (err: any) {
      if (err?.message !== 'SDK_ALREADY_INITIALIZED') {
        console.error(err)
        Analytics.handleError(err)
      }
    }
  }
}

async function setBlurProcessor (pub: LocalTrackPublication): Promise<void> {
  if (pub.track instanceof LocalVideoTrack) {
    if (blurProcessor !== undefined) {
      localVideo = pub.track
      const radius = $myPreferences?.blurRadius ?? 0.1
      if (radius >= 0.5) {
        try {
          await blurProcessor.updateTransformerOptions({ blurRadius: radius })
          await pub.track.setProcessor(blurProcessor)
        } catch (err: any) {
          console.error(err)
          Analytics.handleError(err)
        }
      }
    }
  }
}

export async function updateBlurRadius (value: number): Promise<void> {
  const client = getClient()
  if ($myPreferences !== undefined) {
    await client.update($myPreferences, { blurRadius: value })
  } else {
    const acc = getCurrentAccount().uuid
    await client.createDoc(love.class.DevicesPreference, core.space.Workspace, {
      attachedTo: acc,
      noiseCancellation: true,
      camEnabled: true,
      micEnabled: true,
      blurRadius: value
    })
  }
  try {
    if (blurProcessor !== undefined && localVideo !== undefined) {
      if (value < 0.5) {
        await localVideo.stopProcessor()
      } else {
        const current = localVideo.getProcessor()
        if (current !== undefined) {
          await blurProcessor.updateTransformerOptions({ blurRadius: value })
        } else {
          await blurProcessor.updateTransformerOptions({ blurRadius: value })
          await localVideo.setProcessor(blurProcessor)
        }
      }
    }
  } catch (err: any) {
    console.error(err)
    Analytics.handleError(err)
  }
}

lk.on(RoomEvent.LocalTrackPublished, (pub) => {
  if (pub.source === Track.Source.Microphone) {
    void setKrispProcessor(pub)
  }

  if (pub.source === Track.Source.Camera) {
    void setBlurProcessor(pub)
  }
})
lk.on(RoomEvent.LocalTrackUnpublished, (pub) => {
  if (pub.track?.kind === Track.Kind.Video && pub.track.source === Track.Source.Camera) {
    if (localVideo !== undefined) {
      localVideo = undefined
    }
  }
})
lk.on(RoomEvent.RecordingStatusChanged, (evt) => {
  isRecording.set(evt)
})
lk.on(RoomEvent.RoomMetadataChanged, (metadata) => {
  const data = parseMetadata(metadata)
  isRecording.set(data.recording ?? false)
  isTranscription.set(data.transcription ?? false)
})

lk.on(RoomEvent.Connected, () => {
  const data: RoomMetadata = parseMetadata(lk.metadata)
  isTranscription.set(data.transcription ?? false)
  isRecording.set(data.recording ?? false)
  Analytics.handleEvent(LoveEvents.ConnectedToRoom)
})

function parseMetadata (metadata: string | undefined): RoomMetadata {
  try {
    return metadata == null || metadata === '' ? {} : JSON.parse(metadata)
  } catch (err: any) {
    Analytics.handleError(err)
    return {}
  }
}

export function closeMeetingMinutes (): void {
  const loc = getCurrentLocation()

  if (loc.path[2] === loveId) {
    const meetingMinutes = get(currentMeetingMinutes)
    const panel = get(panelstore).panel
    const { _id } = panel ?? {}

    if (_id !== undefined && meetingMinutes !== undefined && _id === meetingMinutes._id) {
      closePanel()
    }
  }
}

export async function getRoomName (room: Room): Promise<string> {
  if (isOffice(room) && room.person !== null && room.name === '') {
    const employee = await getPersonByPersonRef(room.person)
    if (employee != null) {
      const client = getClient()
      return getName(client.getHierarchy(), employee)
    }
  }
  return room.name
}

export async function getRoomLabel (room: Room): Promise<IntlString> {
  const name = await getRoomName(room)
  if (name !== '') return getEmbeddedLabel(name)
  return isOffice(room) ? love.string.Office : love.string.Room
}

export async function navigateToOfficeDoc (object: Doc): Promise<void> {
  const hierarchy = getClient().getHierarchy()
  const panelComponent = hierarchy.classHierarchyMixin(object._class, view.mixin.ObjectPanel)
  const comp = panelComponent?.component ?? view.component.EditDoc
  const loc = await getObjectLinkFragment(hierarchy, object, {}, comp)
  loc.path[2] = loveId
  loc.path.length = 3
  loc.query = undefined
  navigate(loc)
}

export async function navigateToMeetingMinutes (mm: MeetingMinutes): Promise<void> {
  await navigateToOfficeDoc(mm)
}

export function calculateFloorSize (_rooms: Room[], _preview?: boolean): number {
  let fH: number = 5
  _rooms.forEach((room) => {
    if (room.y + room.height + 2 > fH) fH = room.y + room.height + 2
  })
  return fH
}

async function checkRecordAvailable (): Promise<void> {
  try {
    const endpoint = getMetadata(love.metadata.ServiceEndpoint)
    if (endpoint === undefined) {
      setTimeout(() => {
        void checkRecordAvailable()
      }, 500)
    } else if (endpoint !== '') {
      const res = await fetch(concatLink(endpoint, '/checkRecordAvailable'))
      const result = await res.json()
      isRecordingAvailable.set(result)
    } else {
      console.info('office recording is not configured')
    }
  } catch (err: any) {
    Analytics.handleError(err)
    console.error(err)
  }
}

void checkRecordAvailable()

export async function createMeeting (
  client: TxOperations,
  _id: Ref<Event>,
  space: Space,
  _data: Data<Event>,
  store: Record<string, any>,
  phase: DocCreatePhase
): Promise<void> {
  if (phase === 'post' && store.room != null && store.isMeeting === true) {
    const event = await client.findOne(calendar.class.Event, { _id })
    if (event === undefined) return
    const events = await client.findAll(calendar.class.Event, { eventId: event.eventId })
    for (const event of events) {
      await client.createMixin<Event, MeetingEventLink>(
        event._id,
        calendar.class.Event,
        space._id,
        love.mixin.MeetingEventLink,
        {
          room: store.room as Ref<Room>
        }
      )
    }
    const navigateUrl = getCurrentLocation()
    navigateUrl.path[2] = loveId
    navigateUrl.query = {
      meetId: _id
    }
    const func = await getResource(login.function.GetInviteLink)
    const link = await func(-1, '', -1, AccountRole.Guest, encodeURIComponent(JSON.stringify(navigateUrl)))
    await client.update(event, { location: link })
  }
}

export async function createMeetingSchedule (
  client: TxOperations,
  _id: Ref<Schedule>,
  space: Space,
  _data: Data<Schedule>,
  store: Record<string, any>,
  phase: DocCreatePhase
): Promise<void> {
  if (phase === 'post') {
    const schedule = await client.findOne(calendar.class.Schedule, { _id })
    if (schedule === undefined) return
    await client.createMixin<Schedule, MeetingSchedule>(
      schedule._id,
      calendar.class.Schedule,
      space._id,
      love.mixin.MeetingSchedule,
      {
        room: store.room as Ref<Room>
      }
    )
  }
}

export function getLiveKitEndpoint (): string {
  const endpoint = getMetadata(love.metadata.WebSocketURL)
  if (endpoint === undefined) {
    throw new Error('Livekit endpoint not found')
  }

  return endpoint
}

export function getPlatformToken (): string {
  // TODO: Change to cookie
  const token = getMetadata(presentation.metadata.Token)
  if (token === undefined) {
    throw new Error('Token not found')
  }

  return token
}

export async function startTranscription (mm: MeetingMinutes): Promise<void> {
  const current = get(currentMeetingMinutes)
  if (current === undefined || mm._id !== current._id) return

  await connectMeeting(mm._id, mm.language, { transcription: true })
}

export async function stopTranscription (mm: MeetingMinutes): Promise<void> {
  const current = get(currentMeetingMinutes)
  if (current === undefined || mm._id !== current._id) return

  await disconnectMeeting(mm._id)
}

export async function showRoomSettings (room?: Room): Promise<void> {
  if (room === undefined) return

  showPopup(RoomSettingsPopup, { room }, 'top')
}

export async function copyGuestLink (mm?: MeetingMinutes): Promise<void> {
  if (mm === undefined) return

  const link = await getMeetingGuestLink(mm)
  if (link !== '') {
    await copyTextToClipboard(link)
  }
}

async function getMeetingGuestLink (mm: MeetingMinutes): Promise<string> {
  const endpoint = getMetadata(love.metadata.ServiceEndpoint)
  if (endpoint === undefined) {
    console.error('Love service endpoint is not configured')
    return ''
  }

  const platformToken = getMetadata(presentation.metadata.Token)
  if (platformToken === undefined) {
    throw new Error('Platform token not found')
  }

  try {
    const guestToken = await getLoveClient().getGuestToken(mm)

    const navigateUrl = getCurrentLocation()
    navigateUrl.path = ['meetings']
    navigateUrl.query = {
      meetingId: mm._id,
      guestToken
    }

    // Build direct guest link (no createAccessLink). Use current front origin to build a full URL.
    // This simplifies the flow: result link will be like https://front/meetings?meetingId=...&guestToken=...
    try {
      const front = getMetadata(presentation.metadata.FrontUrl) ?? window.location.origin

      const query = new URLSearchParams({ meetingId: mm._id, guestToken })
      return concatLink(front, `/meetings?${query.toString()}`)
    } catch (err: any) {
      console.error('Failed to create guest link', err)
      return ''
    }
  } catch (err: any) {
    console.error('Failed to generate guest token', err)
    return ''
  }
}

export function isTranscriptionAllowed (): boolean {
  const url = getMetadata(aiBot.metadata.EndpointURL) ?? ''
  return url !== ''
}

export function createMeetingWidget (widget: Widget, room: Ref<Room>, video: boolean): void {
  const tabs: WidgetTab[] = [
    ...(video
      ? [
          {
            id: 'video',
            label: love.string.Video,
            icon: love.icon.Cam,
            readonly: true
          }
        ]
      : []),
    {
      id: 'chat',
      label: chunter.string.Chat,
      icon: view.icon.Bubble,
      readonly: true
    },
    {
      id: 'transcription',
      label: love.string.Transcription,
      icon: view.icon.Feather,
      readonly: true
    }
  ]
  openWidget(
    widget,
    {
      room
    },
    { active: true, openedByUser: false },
    tabs
  )
}

export function createMeetingVideoWidgetTab (widget: Widget): void {
  const state = get(sidebarStore)
  const { widgetsState } = state
  const widgetState = widgetsState.get(widget._id)

  if (widgetState === undefined) return

  const tab: WidgetTab = {
    id: 'video',
    label: love.string.Video,
    icon: love.icon.Cam,
    readonly: true
  }
  updateWidgetState(widget._id, {
    tabs: [tab, ...widgetState.tabs],
    tab: 'video'
  })
  openWidgetTab(love.ids.MeetingWidget, 'video')
}

export async function getMeetingMinutesTitle (
  client: TxOperations,
  ref: Ref<MeetingMinutes>,
  doc?: MeetingMinutes
): Promise<string> {
  const meeting = doc ?? (await client.findOne(love.class.MeetingMinutes, { _id: ref }))

  return meeting?.title ?? ''
}

export async function getUserMeetingInviteTitle (
  client: TxOperations,
  ref: Ref<UserMeetingInvite>,
  doc?: UserMeetingInvite
): Promise<string> {
  const invite = doc ?? (await client.findOne(love.class.UserMeetingInvite, { _id: ref }))
  if (invite === undefined) return ''

  const sender = await client.findOne(contact.class.Person, { _id: invite.from })
  const senderName = sender?.name ?? ''

  return await translate(love.string.InvitingYou, { name: senderName }, getCurrentLanguage())
}

export async function queryMeetingMinutes (
  client: Client,
  search: string,
  filter?: { in?: RelatedDocument[], nin?: RelatedDocument[] }
): Promise<ObjectSearchResult[]> {
  const q: DocumentQuery<MeetingMinutes> = { title: { $like: `%${search}%` } }
  if (filter?.in !== undefined || filter?.nin !== undefined) {
    q._id = {}
    if (filter.in !== undefined) {
      q._id.$in = filter.in?.map((it) => it._id as Ref<MeetingMinutes>)
    }
    if (filter.nin !== undefined) {
      q._id.$nin = filter.nin?.map((it) => it._id as Ref<MeetingMinutes>)
    }
  }
  return (await client.findAll(love.class.MeetingMinutes, q, { limit: 200 })).map(toMeetingMinutesObjectSearchResult)
}

const toMeetingMinutesObjectSearchResult = (e: WithLookup<MeetingMinutes>): ObjectSearchResult => ({
  doc: e,
  title: e.title,
  icon: love.icon.MeetingMinutes,
  component: MeetingMinutesSearchItem
})
