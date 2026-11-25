import { getMetadata, type Resources } from '@hcengineering/platform'
import aiBot from '@hcengineering/ai-bot'
import calendar, { type Event } from '@hcengineering/calendar'
import {
  AccountRole,
  SortingOrder,
  getCurrentAccount,
  hasAccountRole,
  type AccountUuid,
  type Client,
  type Doc,
  type Ref
} from '@hcengineering/core'
import { registerEventCardResolver, type EventCardWithEditor } from '@hcengineering/calendar-resources'
import { type MeetingEventLink, type MeetingMinutes, type PermanentMeeting } from '@hcengineering/love'
import love from '@hcengineering/love'
import { getClient } from '@hcengineering/presentation'
import { showPopup, type AnyComponent } from '@hcengineering/ui'
import { getCurrentEmployee } from '@hcengineering/contact'
import { getPersonByPersonRef } from '@hcengineering/contact-resources'
import { findMeetingLink, seriesKeyOf } from './meetingLink'

import ControlExt from './components/meeting/ControlExt.svelte'
import InvitesExt from './components/meeting/invites/InvitesExt.svelte'
import EditMeetingData from './components/EditMeetingData.svelte'
import Main from './components/Main.svelte'
import MeetingData from './components/MeetingData.svelte'
import SelectScreenSourcePopup from './components/SelectScreenSourcePopup.svelte'
import Settings from './components/Settings.svelte'
import WorkbenchExtension from './components/WorkbenchExtension.svelte'
import LoveWidget from './components/LoveWidget.svelte'
import MeetingWidget from './components/meeting/widget/MeetingWidget.svelte'
import WidgetSwitcher from './components/meeting/widget/WidgetSwitcher.svelte'
import MeetingMinutesPresenter from './components/MeetingMinutesPresenter.svelte'
import MeetingMinutesSection from './components/MeetingMinutesSection.svelte'
import EditMeetingMinutes from './components/EditMeetingMinutes.svelte'
import EditPermanentMeeting from './components/EditPermanentMeeting.svelte'
import EditScheduledMeeting from './components/EditScheduledMeeting.svelte'
import EditMeeting from './components/EditMeeting.svelte'
import MeetingSessionsFooter from './components/MeetingSessionsFooter.svelte'
import MeetingAccessEditor from './components/MeetingAccessEditor.svelte'
import CreatePermanentMeetingPopup from './components/CreatePermanentMeetingPopup.svelte'
import PermanentMeetingForm from './components/PermanentMeetingForm.svelte'
import PermanentMeetingPresenter from './components/PermanentMeetingPresenter.svelte'
import PermanentMeetingNextPresenter from './components/PermanentMeetingNextPresenter.svelte'
import PermanentMeetingLastSessionPresenter from './components/PermanentMeetingLastSessionPresenter.svelte'
import PermanentMeetingGroupPresenter from './components/PermanentMeetingGroupPresenter.svelte'
import PermanentMeetingsHeaderActions from './components/PermanentMeetingsHeaderActions.svelte'
import MeetingGroupPopup from './components/MeetingGroupPopup.svelte'
import EditRoom from './components/EditRoom.svelte'
import FloorAttributePresenter from './components/FloorAttributePresenter.svelte'
import FloorView from './components/FloorView.svelte'
import MeetingMinutesTable from './components/MeetingMinutesTable.svelte'
import FloorMeetingMinutesList from './components/FloorMeetingMinutesList.svelte'
import RoomAttributePresenter from './components/RoomAttributePresenter.svelte'
import MeetingMinutesMessagesPresenter from './components/MeetingMinutesMessagesPresenter.svelte'
import MeetingMinutesTranscriptionPresenter from './components/MeetingMinutesTranscriptionPresenter.svelte'
import RoomPresenter from './components/RoomPresenter.svelte'
import MeetingMinutesDocEditor from './components/MeetingMinutesDocEditor.svelte'
import MeetingMinutesStatusPresenter from './components/MeetingMinutesStatusPresenter.svelte'
import MeetingMinutesTranscriptionStatePresenter from './components/MeetingMinutesTranscriptionStatePresenter.svelte'
import MeetingSummaryEditor from './components/MeetingSummaryEditor.svelte'
import MeetingMinutesRecordingStatePresenter from './components/MeetingMinutesRecordingStatePresenter.svelte'
import RoomLanguageEditor from './components/RoomLanguageEditor.svelte'
import MediaPopupItemExt from './components/MediaPopupItemExt.svelte'
import SharingStateIndicator from './components/SharingStateIndicator.svelte'
import SpeakingWhileMutedIndicator from './components/meeting/SpeakingWhileMutedIndicator.svelte'
import MeetingScheduleData from './components/MeetingScheduleData.svelte'
import EditMeetingScheduleData from './components/EditMeetingScheduleData.svelte'
import InviteEmployeeButton from './components/meeting/invites/InviteEmployeeButton.svelte'
import MeetingEventBadge from './components/MeetingEventBadge.svelte'
import PendingRecordingPresenter from './components/PendingRecordingPresenter.svelte'
import GuestMeetingApp from './components/guest/GuestMeetingApp.svelte'
import RoomMeetingsFooter from './components/RoomMeetingsFooter.svelte'
import MeetingMinutesBreadcrumb from './components/MeetingMinutesBreadcrumb.svelte'
import MeetingMinutesView from './components/MeetingMinutesView.svelte'
import MeetingMinutesListItem from './components/MeetingMinutesListItem.svelte'
import RoomsView from './components/RoomsView.svelte'
import RoomTablePresenter from './components/RoomTablePresenter.svelte'
import RoomListItem from './components/RoomListItem.svelte'
import MeetingAccessAttributeEditor from './components/MeetingAccessAttributeEditor.svelte'
import PermanentMeetingMembersEditor from './components/PermanentMeetingMembersEditor.svelte'
import MeetingPrivateEditor from './components/MeetingPrivateEditor.svelte'
import RepeatEveryEditor from './components/RepeatEveryEditor.svelte'
import ReminderBeforePresenter from './components/ReminderBeforePresenter.svelte'
import ReminderBeforeEditor from './components/ReminderBeforeEditor.svelte'

// Wires the meeting reminders: the client is the only thing that can deliver them, there is no
// scheduler for calendar events on the server.
import './meetingReminders'

import {
  copyGuestLink,
  createMeeting,
  createMeetingSchedule,
  showRoomSettings,
  startTranscription,
  stopTranscription,
  getMeetingMinutesTitle,
  getRoomTitle,
  queryMeetingMinutes,
  getUserMeetingInviteTitle,
  toggleRoomPrivacy
} from './utils'
import { canEditMeeting, canLeaveMeeting, isPermanentMeetingCreator } from './permissions'
import { toggleMicState, toggleCamState } from '@hcengineering/media-resources'

function canShowRoomSettings (): boolean | undefined {
  if (!hasAccountRole(getCurrentAccount(), AccountRole.User)) {
    return undefined
  }
  // For now settings is available only when AI bot is enabled
  const url = getMetadata(aiBot.metadata.EndpointURL) ?? ''
  return url !== ''
}

function canCopyGuestLink (): boolean {
  return hasAccountRole(getCurrentAccount(), AccountRole.User)
}

async function isRoomOwner (mm?: MeetingMinutes): Promise<boolean> {
  if (mm === undefined) return false
  const me = getCurrentEmployee()
  const currentPerson = await getPersonByPersonRef(me)
  const myAccount = currentPerson?.personUuid as AccountUuid | undefined
  return myAccount !== undefined ? (mm.owners?.includes(myAccount) ?? false) : false
}

async function canCloseRoom (mm?: MeetingMinutes): Promise<boolean> {
  if (mm === undefined || mm.private) return false
  return await isRoomOwner(mm)
}

async function canOpenRoom (mm?: MeetingMinutes): Promise<boolean> {
  if (mm?.private !== true) return false
  return await isRoomOwner(mm)
}

// An owner cannot walk out: the server puts an owner straight back, so offering the action would be
// a lie - the meeting is closed by handing ownership over, not by leaving.
async function canLeavePermanentMeeting (object?: Doc): Promise<boolean> {
  const meeting = object as PermanentMeeting | undefined
  return meeting !== undefined && canLeaveMeeting(meeting, getCurrentAccount())
}

async function leavePermanentMeeting (object: Doc): Promise<void> {
  const meeting = object as PermanentMeeting
  const me = getCurrentAccount().uuid
  await getClient().update(meeting, { $pull: { members: me } })
}

/** Only the creator removes a meeting; everyone else can only walk out. */
async function canDeletePermanentMeeting (object?: Doc): Promise<boolean> {
  const meeting = object as PermanentMeeting | undefined
  return meeting !== undefined && isPermanentMeetingCreator(meeting, getCurrentAccount())
}

/** Settings stay open to members: the window itself only allows what the meeting lets them change. */
async function canEditPermanentMeeting (object?: Doc): Promise<boolean> {
  const meeting = object as PermanentMeeting | undefined
  return meeting !== undefined && canEditMeeting(meeting, getCurrentAccount())
}

function editPermanentMeetingSettings (object: Doc): void {
  showPopup(PermanentMeetingForm, { object: object as PermanentMeeting }, 'content')
}

/**
 * A series carries the id of the meeting it belongs to; a plain calendar event has none and keeps
 * the calendar editor, so the action is offered to members of a meeting only.
 */
async function canEditMeetingSettings (object?: Doc): Promise<boolean> {
  const link = object as MeetingEventLink | undefined
  if (link?.permanentMeeting === undefined) return false
  const meeting = await getClient().findOne(love.class.PermanentMeeting, { _id: link.permanentMeeting })
  return meeting !== undefined && (await canEditPermanentMeeting(meeting))
}

async function editMeetingSettings (object: Doc): Promise<void> {
  const link = object as MeetingEventLink
  if (link.permanentMeeting === undefined) return
  const meeting = await getClient().findOne(love.class.PermanentMeeting, { _id: link.permanentMeeting })
  if (meeting === undefined) return
  showPopup(PermanentMeetingForm, { object: meeting }, 'content')
}

/**
 * A view action: the checked meetings come in as the preselection, and the dialog can also create a
 * group from scratch - so it stays available with nothing checked.
 */
async function canMergeIntoGroup (): Promise<boolean> {
  return true
}

async function mergeIntoGroup (docs: Doc | Doc[] | undefined): Promise<void> {
  const list = docs === undefined ? [] : Array.isArray(docs) ? docs : [docs]
  const ids = list
    .filter((it) => it._class === love.class.PermanentMeeting)
    .map((it) => it._id as Ref<PermanentMeeting>)
  showPopup(MeetingGroupPopup, { preselected: ids }, 'center')
}

/**
 * A meeting series is only a projection: the meeting itself is a document of its own, and its
 * window - not the calendar editor - is what a click on the event opens. The calendar asks here
 * first, so the answer names both the series to edit and the window that draws it; a plain event
 * says nothing and keeps the calendar's quick-edit popup.
 */
async function resolveMeetingCard (client: Client, event: Doc): Promise<Doc | EventCardWithEditor | undefined> {
  const link = await findMeetingLink(client, event)
  if (link === undefined) return undefined

  // An occurrence is a projection of the series: the series is the identity of the meeting, and
  // only the series carries the fields the window edits. `recurringEventId` names it on an
  // expanded occurrence, `eventId` on a stored instance - both are read, the id itself is the last
  // resort.
  const instance = event as { recurringEventId?: Ref<Doc>, eventId?: string }
  const seriesId = instance.recurringEventId ?? (instance.eventId as unknown as Ref<Doc> | undefined) ?? event._id
  const series =
    seriesId === event._id
      ? event
      : ((await client.findOne(calendar.class.Event, { _id: seriesId as Ref<Event> })) ?? event)
  return { object: series as Doc, editor: EditMeeting as unknown as AnyComponent }
}

// The calendar asks before it opens an event: a meeting series answers with the meeting itself.
// Registered on import and not in the plugin factory: a hot reload re-runs modules, not factories.
registerEventCardResolver(resolveMeetingCard)

export { setCustomCreateScreenTracks } from './utils'

export default async (): Promise<Resources> => ({
  component: {
    Main,
    ControlExt,
    InvitesExt,
    Settings,
    WorkbenchExtension,
    SelectScreenSourcePopup,
    MeetingData,
    EditMeetingData,
    LoveWidget,
    MeetingWidget,
    WidgetSwitcher,
    MeetingMinutesPresenter,
    MeetingMinutesSection,
    EditMeetingMinutes,
    EditPermanentMeeting,
    EditScheduledMeeting,
    EditMeeting,
    MeetingSessionsFooter,
    MeetingAccessEditor,
    CreatePermanentMeetingPopup,
    PermanentMeetingForm,
    PermanentMeetingPresenter,
    PermanentMeetingNextPresenter,
    PermanentMeetingLastSessionPresenter,
    PermanentMeetingGroupPresenter,
    PermanentMeetingsHeaderActions,
    EditRoom,
    FloorAttributePresenter,
    FloorView,
    MeetingMinutesTable,
    FloorMeetingMinutesList,
    RoomAttributePresenter,
    MeetingMinutesMessagesPresenter,
    MeetingMinutesTranscriptionPresenter,
    RoomPresenter,
    MeetingMinutesDocEditor,
    MeetingMinutesStatusPresenter,
    MeetingMinutesTranscriptionStatePresenter,
    MeetingSummaryEditor,
    MeetingMinutesRecordingStatePresenter,
    RoomLanguageEditor,
    MediaPopupItemExt,
    SharingStateIndicator,
    SpeakingWhileMutedIndicator,
    MeetingScheduleData,
    EditMeetingScheduleData,
    InviteEmployeeButton,
    MeetingEventBadge,
    PendingRecordingPresenter,
    GuestMeetingApp,
    RoomMeetingsFooter,
    MeetingMinutesBreadcrumb,
    MeetingMinutesView,
    MeetingMinutesListItem,
    RoomsView,
    RoomTablePresenter,
    RoomListItem,
    MeetingAccessAttributeEditor,
    PermanentMeetingMembersEditor,
    MeetingPrivateEditor,
    RepeatEveryEditor,
    ReminderBeforePresenter,
    ReminderBeforeEditor
  },
  function: {
    CreateMeeting: createMeeting,
    CreateMeetingSchedule: createMeetingSchedule,
    CanShowRoomSettings: canShowRoomSettings,
    CanCopyGuestLink: canCopyGuestLink,
    CanCloseRoom: canCloseRoom,
    CanOpenRoom: canOpenRoom,
    CanLeavePermanentMeeting: canLeavePermanentMeeting,
    CanDeletePermanentMeeting: canDeletePermanentMeeting,
    CanEditPermanentMeeting: canEditPermanentMeeting,
    CanMergeIntoGroup: canMergeIntoGroup,
    CanEditMeetingSettings: canEditMeetingSettings,
    MeetingMinutesTitleProvider: getMeetingMinutesTitle,
    RoomTitleProvider: getRoomTitle,
    UserMeetingInviteTitleProvider: getUserMeetingInviteTitle
  },
  actionImpl: {
    ToggleMic: toggleMicState,
    ToggleVideo: toggleCamState,
    StartTranscribing: startTranscription,
    StopTranscribing: stopTranscription,
    ShowRoomSettings: showRoomSettings,
    CopyGuestLink: copyGuestLink,
    ToggleRoomPrivacy: toggleRoomPrivacy,
    LeavePermanentMeeting: leavePermanentMeeting,
    EditPermanentMeetingSettings: editPermanentMeetingSettings,
    EditMeetingSettings: editMeetingSettings,
    MergeIntoGroup: mergeIntoGroup
  },
  completion: {
    MeetingMinutesQuery: queryMeetingMinutes
  }
})
