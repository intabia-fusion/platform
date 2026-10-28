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

import { expect, test, type Page } from '@playwright/test'

import type { AccountUuid, Ref, Space, TxOperations } from '@hcengineering/core'
import calendar, { AccessLevel, generateEventId, type Event, type Calendar } from '@hcengineering/calendar'
import contact from '@hcengineering/contact'
import love, {
  MeetingStatus,
  RecordingState,
  TranscriptionState,
  type MeetingMinutes,
  type Room
} from '@hcengineering/love'
import { generateId as generateCoreId } from '@hcengineering/core'

import { connectTracker } from '../API/TrackerApi'
import { enableJsonProtocol, trackTxFrames, type TxFrame } from '../rage-click/tx-frames'
import { PlatformURI, PlatformUserSecond, generateId as generateTestId, rageClick } from '../utils'
import {
  clickFirstAvailableRoom,
  clickOfficeOf,
  closeMeetingContexts,
  connectedMarker,
  knockAndWaitPending,
  loveWindow,
  occupiedCells,
  openLove,
  openMeetingMinutes,
  startOrJoin,
  waitConnected,
  waitForActiveMeetingsToFinish,
  waitRoomMeeting
} from './meeting-helpers'

const MEETINGS_WS = 'meetings-ws'

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.

// Background noise unrelated to any click under test: a periodic billing/limits poll that
// 401/403s independent of what the test does - a request this suite's own actions make never
// 401s (an auth problem, not a business-logic race), so any "resource" 401 is this poll too.
const IGNORED_ERROR = /billing|limitsindicator|tokenwindow|failed to load resource.*401/i

/** Collects console/page errors so a rage click's extra (blocked-by-the-guard) calls - a second
 *  `disconnect()`, a second join attempt - surface as a concrete failure instead of a flaky UI read. */
function watchErrors (page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (!IGNORED_ERROR.test(err.message)) errors.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORED_ERROR.test(msg.text())) errors.push(msg.text())
  })
  return errors
}

/** Copied from meetings.invite.tests.ts (read-only reference) - picks a teammate by last name in
 *  the invite picker and confirms. */
async function inviteByLastName (page: Page, lastName: string): Promise<void> {
  await page.locator('[data-id="invite-button"]').first().click()
  const popup = page.locator('.hulyModal-container').last()
  const search = popup.getByPlaceholder(/Search/i)
  await expect(search).toBeVisible({ timeout: 5000 })
  await search.fill(lastName)
  let clicked = false
  for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
    const row = popup.locator('button.row').filter({ hasText: lastName }).first()
    try {
      await expect(row).toBeVisible({ timeout: 5000 })
      await row.click({ timeout: 3000 })
      clicked = true
    } catch {
      await page.waitForTimeout(300)
    }
  }
  if (!clicked) {
    throw new Error(`Failed to click invite-picker row for "${lastName}" after retries`)
  }
  const ok = popup.locator('.hulyModal-footer').getByRole('button', { name: /^Invite$/i })
  await expect(ok).toBeEnabled({ timeout: 5000 })
  await ok.click()
}

/** Copied from meetings.invite.tests.ts (read-only reference). */
async function openIncomingInvitePopup (page: Page): Promise<void> {
  const btn = page.locator('[data-id="incoming-invite-trigger"]')
  await expect(btn).toBeVisible({ timeout: 15000 })
  await btn.click()
}

/** Copied from meetings.knock-office.tests.ts (read-only reference): personal offices render with
 *  an empty `data-id="room-"`, so the owner connects through their own office card. */
async function connectToOwnOffice (page: Page): Promise<void> {
  const office = page.locator('div.floorGrid-room.myOffice').first()
  await expect(office).toBeVisible({ timeout: 15000 })
  const avatarCell = office.locator('.floorGrid-room__field').first()
  await avatarCell.hover()
  await avatarCell.click()
  const startBtn = page.locator('[data-id="start-own-meeting"]').first()
  await expect(startBtn).toBeVisible({ timeout: 10000 })
  await startBtn.click()
  await waitConnected(page)
}

// --- Wire-level tx counting (docs/memory/rpc-json-protocol.md, ../rage-click/tx-frames.ts) -----
// For a guard around `client.diffUpdate(doc, {...})`: every rapid click reads the same
// pre-update local field and sends the identical target value, so the end state and the number
// of *observable* UI transitions are the same with or without the guard - only the number of tx
// frames on the wire differs.

/** Counts outgoing `TxUpdateDoc`/`TxMixin` frames that touch `objectId` and set `opKey`.
 *  `diffUpdate` never goes through `apply()`, so the frames from `trackTxFrames` need no
 *  further unwrapping here. */
function countMatchingTx (frames: TxFrame[], objectId: string, opKey: string): number {
  let count = 0
  for (const tx of frames) {
    const ops = tx.operations ?? (tx as any).attributes
    if (tx.objectId === objectId && ops !== undefined && opKey in ops) count++
  }
  return count
}

// --- EditMeetingData setup: a calendar event linked to a MeetingMinutes via the
// love.mixin.MeetingEventLink mixin (plugins/love-resources/src/utils.ts `createMeeting`,
// the real post-create hook for "Schedule Meeting", read as the reference for the doc shapes). ---
interface ScheduledMeetingSetup {
  client: TxOperations
  eventId: Ref<Event>
  eventTitle: string
  meetingId: Ref<MeetingMinutes>
  personSpace: Ref<Space>
}

async function getUserCalendar (client: TxOperations, accountUuid: AccountUuid): Promise<Ref<Calendar>> {
  // Server trigger creates exactly this id on first login (server-plugins/calendar-resources).
  const direct = `${accountUuid}_calendar` as Ref<Calendar>
  const found = await client.findOne(calendar.class.Calendar, { _id: direct })
  if (found !== undefined) return found._id
  const any = await client.findOne(calendar.class.Calendar, { hidden: false })
  if (any === undefined) throw new Error('No personal calendar found')
  return any._id
}

async function createScheduledMeetingEvent (roomName: string, status: MeetingStatus): Promise<ScheduledMeetingSetup> {
  const { client, workspaceToken } = await connectTracker(MEETINGS_WS, PlatformUserSecond)
  const accountUuid = workspaceToken.info.account
  const employee = await client.findOne(contact.mixin.Employee, { personUuid: accountUuid })
  if (employee === undefined) throw new Error('Employee not found')
  // Event.user wants a PersonId; a SocialIdentity's own _id doubles as one (contact plugin).
  const socialIdentity = await client.findOne(contact.class.SocialIdentity, { attachedTo: employee._id })
  if (socialIdentity === undefined) throw new Error('No social identity for the user')
  const socialId = socialIdentity._id
  const personSpace = await client.findOne(contact.class.PersonSpace, { person: employee._id })
  if (personSpace === undefined) throw new Error('Person space not found')
  const calendarId = await getUserCalendar(client, accountUuid)
  const room = await client.findOne<Room>(love.class.Room, { name: roomName })
  if (room === undefined) throw new Error(`Room "${roomName}" not found`)

  const eventTitle = `Rage click meeting ${generateTestId(8)}`
  const eventId: Ref<Event> = generateCoreId()
  const now = Date.now()
  await client.addCollection(
    calendar.class.Event,
    personSpace._id,
    calendar.ids.NoAttached,
    calendar.class.Event,
    'events',
    {
      calendar: calendarId,
      eventId: generateEventId(),
      date: now,
      dueDate: now + 60 * 60 * 1000,
      description: '',
      visibility: 'public' as const,
      participants: [employee._id],
      reminders: [],
      title: eventTitle,
      location: '',
      blockTime: true,
      allDay: false,
      access: AccessLevel.Owner,
      user: socialId
    },
    eventId
  )

  const meetingId: Ref<MeetingMinutes> = generateCoreId()
  await client.createDoc(
    love.class.MeetingMinutes,
    meetingId as unknown as Ref<Space>,
    {
      name: eventTitle,
      description: '',
      private: room.startPrivate ?? false,
      archived: false,
      members: [accountUuid],
      owners: [accountUuid],
      descriptionRef: null,
      summary: null,
      roomId: room._id,
      status,
      language: room.language ?? 'en',
      recordingState: RecordingState.NotStarted,
      transcriptionState: TranscriptionState.NotStarted,
      startWithRecording: room.startWithRecording ?? false,
      startWithTranscription: room.startWithTranscription ?? false,
      meetingScheduledDate: now
    },
    meetingId
  )

  await client.createMixin(eventId, calendar.class.Event, personSpace._id, love.mixin.MeetingEventLink, {
    room: room._id,
    meetingId
  })

  return { client, eventId, eventTitle, meetingId, personSpace: personSpace._id }
}

async function cleanupScheduledMeetingEvent (setup: ScheduledMeetingSetup): Promise<void> {
  try {
    await setup.client.removeCollection(
      calendar.class.Event,
      setup.personSpace,
      setup.eventId,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events'
    )
  } catch {
    // Best-effort.
  }
  try {
    await setup.client.removeDoc(love.class.MeetingMinutes, setup.meetingId as unknown as Ref<Space>, setup.meetingId)
  } catch {
    // Best-effort.
  }
  await setup.client.close()
}

/** Calendar's month view (Day.svelte) renders each event as a `.event` cell with its title;
 *  clicking it opens EditEvent as a `content` panel, which is where EditMeetingData mounts. */
async function openCalendarEventPanel (page: Page, eventTitle: string): Promise<void> {
  // Calendar has no standalone app/URL route - it is a Fixed WidgetsBar widget
  // (models/calendar/src/index.ts `calendar.ids.CalendarWidget`), opened the same way as Love's
  // own Office widget: `AppItem`'s root button id is `'app-' + label` (packages/workbench-
  // resources/.../AppItem.svelte), where `label` is the untranslated IntlString id.
  await (await page.goto(`${PlatformURI}/workbench/${MEETINGS_WS}`))?.finished()
  await page.locator('[id="app-calendar\\:string\\:Calendar"]').click()
  // Default view is CalendarMode.Days (DayCalendar.svelte), where events render as
  // `.event-container` (EventElement.svelte) - Day.svelte's `.event` class belongs to the Month
  // grid, which is not the default.
  const cell = page.locator('.event-container', { hasText: eventTitle }).first()
  await expect(cell).toBeVisible({ timeout: 20000 })
  await cell.click()
}

// Registered from meetings.all.spec.ts: run serially with the other meeting tests, which share
// these users and offices - a separate spec file ran in a parallel worker and broke both.
export function registerRageClickTests (): void {
  test.describe('Rage click: love meetings', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('LeaveRoomButton runs leave once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx, page } = await loveWindow(browser, 'second')
      const errors = watchErrors(page)

      try {
        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page)
        await waitConnected(page)

        const leaveBtn = page.locator('[data-id="meeting-leave"]').first()
        await expect(leaveBtn).toBeVisible({ timeout: 15000 })
        errors.length = 0

        await rageClick(leaveBtn)

        await expect(connectedMarker(page)).toHaveCount(0, { timeout: 20000 })
        // Works again: the floor is usable, not stuck behind a dead leave in flight.
        await openLove(page)
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('EditMeetingMinutes "Leave Room" runs leave once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx, page } = await loveWindow(browser, 'second')
      const errors = watchErrors(page)

      try {
        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page)
        await waitConnected(page)

        await openMeetingMinutes(page, room as string)
        // Scoped to the object-editor panel (`div.panel-instance`, see meeting-helpers'
        // `clickRoomByName`): the floating widget/control-bar leave button shares the same
        // `data-id` and must not be the one this test clicks.
        const leaveBtn = page.locator('div.panel-instance').first().locator('[data-id="meeting-leave"]')
        await expect(leaveBtn).toBeVisible({ timeout: 15000 })
        errors.length = 0

        await rageClick(leaveBtn)

        await expect(connectedMarker(page)).toHaveCount(0, { timeout: 20000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('RoomPopup "Enter Room" joins once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx: ctx2, page: page2 } = await loveWindow(browser, 'second')
      const { ctx: ctx3, page: page3 } = await loveWindow(browser, 'third')
      const errors = watchErrors(page3)

      try {
        const room = await clickFirstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page2)
        await waitConnected(page2)

        // Reached through the global root-bar active-meeting button (ControlExt), not through the
        // floor's own room card - that path already has coverage elsewhere.
        const roomButton = page3
          .locator('.hulyStatusBarButton')
          .filter({ hasText: room as string })
          .first()
        await expect(roomButton).toBeVisible({ timeout: 30000 })
        await roomButton.click()

        const enterBtn = page3.locator('[data-id="room-enter"]')
        await expect(enterBtn).toBeVisible({ timeout: 10000 })
        errors.length = 0

        await rageClick(enterBtn)

        await expect.poll(async () => await occupiedCells(page3, room as string), { timeout: 30000 }).toBe(2)
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('IncomingInvitePopup "Join" joins once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx: ctx2, page: page2 } = await loveWindow(browser, 'second')
      const { ctx: ctx3, page: page3 } = await loveWindow(browser, 'third')
      const errors = watchErrors(page3)

      try {
        const room = await clickFirstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')
        await openIncomingInvitePopup(page3)

        const joinBtn = page3.locator('[data-id="invite-join"] button')
        await expect(joinBtn).toBeVisible({ timeout: 10000 })
        errors.length = 0

        await rageClick(joinBtn)

        await expect(page3.locator('[data-id="meeting-widget"]')).toHaveCount(1, { timeout: 30000 })
        await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(0, { timeout: 10000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('IncomingInvitePopup "Reject" resolves once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx: ctx2, page: page2 } = await loveWindow(browser, 'second')
      const { ctx: ctx3, page: page3 } = await loveWindow(browser, 'third')
      const errors = watchErrors(page3)

      try {
        const room = await clickFirstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page2)
        await waitConnected(page2)

        await inviteByLastName(page2, 'Muram')
        await openIncomingInvitePopup(page3)

        const rejectBtn = page3.locator('[data-id="invite-reject"] button')
        await expect(rejectBtn).toBeVisible({ timeout: 10000 })
        errors.length = 0

        await rageClick(rejectBtn)

        await expect(page3.locator('[data-id="incoming-invite-trigger"]')).toHaveCount(0, { timeout: 10000 })
        await expect(page2.locator('[data-id="outgoing-invite-trigger"]')).toHaveCount(0, { timeout: 10000 })
        await expect(page3.locator('[data-id="meeting-widget"]')).toHaveCount(0)
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })

    test('KnockingList "Admit" admits once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx: ownerCtx, page: owner } = await loveWindow(browser, 'second')
      const { ctx: knockerCtx, page: knocker } = await loveWindow(browser, 'third')
      const errors = watchErrors(owner)

      try {
        await connectToOwnOffice(owner)

        await clickOfficeOf(knocker, 'Dirak')
        await expect(knocker.locator('[data-id="meeting-knock"]').first()).toBeVisible({ timeout: 30000 })
        await knockAndWaitPending(knocker)

        const knockingItem = owner.locator('[data-id="knocking-item"]').first()
        await expect(knockingItem).toBeVisible({ timeout: 30000 })
        const admitBtn = knockingItem.locator('[data-id="knock-accept"]')
        errors.length = 0

        await rageClick(admitBtn)

        await expect(knocker.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })
        await expect(owner.locator('[data-id="knocking-item"]')).toHaveCount(0, { timeout: 10000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([
          { ctx: ownerCtx, pages: [owner] },
          { ctx: knockerCtx, pages: [knocker] }
        ])
      }
    })

    test('KnockingList "Decline" declines once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx: ownerCtx, page: owner } = await loveWindow(browser, 'second')
      const { ctx: knockerCtx, page: knocker } = await loveWindow(browser, 'third')
      const errors = watchErrors(owner)

      try {
        await connectToOwnOffice(owner)

        await clickOfficeOf(knocker, 'Dirak')
        await expect(knocker.locator('[data-id="meeting-knock"]').first()).toBeVisible({ timeout: 30000 })
        await knockAndWaitPending(knocker)

        const knockingItem = owner.locator('[data-id="knocking-item"]').first()
        await expect(knockingItem).toBeVisible({ timeout: 30000 })
        const declineBtn = knockingItem.locator('[data-id="knock-reject"]')
        errors.length = 0

        await rageClick(declineBtn)

        await expect(owner.locator('[data-id="knocking-item"]')).toHaveCount(0, { timeout: 10000 })
        // Not auto-joined by a stray second accept racing the decline.
        await expect(knocker.locator('[data-id="meeting-widget"]')).toHaveCount(0)
        await expect(knocker.locator('[data-id="meeting-knock"]').first()).toBeVisible({ timeout: 10000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([
          { ctx: ownerCtx, pages: [owner] },
          { ctx: knockerCtx, pages: [knocker] }
        ])
      }
    })

    test('EditMeetingMinutes privacy toggle sends one tx, not three (wire)', async ({ browser }) => {
      test.setTimeout(60000)
      // A fresh context, not the shared `loveWindow`: forcing the JSON protocol must happen before
      // the very first navigation, and switching the shared window's protocol would leak into
      // every other test in this file.
      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      await enableJsonProtocol(page)
      const tx = trackTxFrames(page)

      try {
        await openLove(page)
        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page)
        await waitConnected(page)
        const meeting = await waitRoomMeeting(room as string)

        await openMeetingMinutes(page, room as string)
        const toggleBtn = page.locator('[data-id="meeting-toggle-private"]')
        await expect(toggleBtn).toBeVisible({ timeout: 15000 })
        tx.frames.length = 0

        await rageClick(toggleBtn)

        // Settle: diffUpdate's own round trip, not a UI signal - the point of this test is the
        // wire count, which a UI read cannot distinguish (see `enableJsonProtocol` above). Wait for
        // the first tx, then hold briefly so a duplicate the guard should block can still show up.
        await expect.poll(() => countMatchingTx(tx.frames, meeting._id, 'private')).toBeGreaterThanOrEqual(1)
        await page.waitForTimeout(500)
        const txCount = countMatchingTx(tx.frames, meeting._id, 'private')
        expect(txCount, `expected exactly one "private" tx, frames: ${JSON.stringify(tx.frames)}`).toBe(1)
      } finally {
        await page.close()
        await ctx.close()
        await waitForActiveMeetingsToFinish()
      }
    })

    test('MediaPopupItemExt "Leave" leaves once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx, page } = await loveWindow(browser, 'second')
      const errors = watchErrors(page)

      try {
        const room = await clickFirstAvailableRoom(page)
        test.skip(room === null, 'No regular room available')
        await startOrJoin(page)
        await waitConnected(page)

        // Opened through MediaSettingsButton (media-resources), covered on its own in
        // rage-click/love.spec.ts - here only the extension it renders (MediaPopupItemExt) matters.
        const mediaBtn = page.locator('.hot-controls-container .options-button')
        await expect(mediaBtn).toBeVisible({ timeout: 15000 })
        await mediaBtn.click()

        const leaveBtn = page.locator('.antiPopup.mediaPopup').getByRole('button', { name: 'Leave', exact: true })
        await expect(leaveBtn).toBeVisible({ timeout: 10000 })
        errors.length = 0

        await rageClick(leaveBtn)

        await expect(connectedMarker(page)).toHaveCount(0, { timeout: 20000 })
        // Works again: back to a clean floor, not stuck behind the room panel the media popup
        // left open - `resetLoveWindows`'s own leave-detection only looks for `meeting-leave`.
        await openLove(page)
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('MediaPopupItemExt "End Meeting" ends once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const { ctx, page } = await loveWindow(browser, 'second')
      const errors = watchErrors(page)

      try {
        await connectToOwnOffice(page)

        const mediaBtn = page.locator('.hot-controls-container .options-button')
        await expect(mediaBtn).toBeVisible({ timeout: 15000 })
        await mediaBtn.click()

        const endBtn = page.locator('.antiPopup.mediaPopup').getByRole('button', { name: 'End meeting', exact: true })
        await expect(endBtn).toBeVisible({ timeout: 10000 })
        errors.length = 0

        await rageClick(endBtn)

        await expect(connectedMarker(page)).toHaveCount(0, { timeout: 20000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await closeMeetingContexts([{ ctx, pages: [page] }])
      }
    })

    test('EditMeetingData "Start Meeting" joins once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const setup = await createScheduledMeetingEvent('Meeting Room 1', MeetingStatus.Scheduled)
      // A fresh context, not the shared `loveWindow`: that window carries a reconnect-to-meeting
      // anchor (`love.activeMeeting` in sessionStorage) from earlier meeting tests in this file,
      // and `reconnectToCurrentMeeting` (plugins/love-resources/src/meetings.ts) silently navigates
      // it back to the Office floor the moment it lands on Calendar - confirmed empirically: a
      // fresh context stays put, the shared window did not.
      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      const errors = watchErrors(page)

      try {
        await openCalendarEventPanel(page, setup.eventTitle)
        const startBtn = page.getByRole('button', { name: 'Start meeting', exact: true })
        await expect(startBtn).toBeVisible({ timeout: 15000 })
        errors.length = 0

        await rageClick(startBtn)

        await expect(connectedMarker(page)).toHaveCount(1, { timeout: 30000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await page.close()
        await ctx.close()
        await cleanupScheduledMeetingEvent(setup)
        await waitForActiveMeetingsToFinish()
      }
    })

    test('EditMeetingData "End Meeting" ends once (rage click)', async ({ browser }) => {
      test.setTimeout(60000)
      const setup = await createScheduledMeetingEvent('Meeting Room 2', MeetingStatus.Scheduled)
      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      const errors = watchErrors(page)

      try {
        await openCalendarEventPanel(page, setup.eventTitle)
        // Setup, not the assertion: a real join is the only way to reach the Active status the
        // End Meeting button needs - a status written directly over REST has no LiveKit room
        // behind it, and `requestFinishMeeting` on a room that never existed is a different test.
        const startBtn = page.getByRole('button', { name: 'Start meeting', exact: true })
        await expect(startBtn).toBeVisible({ timeout: 15000 })
        await startBtn.click()
        await expect(connectedMarker(page)).toHaveCount(1, { timeout: 30000 })

        await openCalendarEventPanel(page, setup.eventTitle)
        const endBtn = page.getByRole('button', { name: 'End meeting', exact: true })
        await expect(endBtn).toBeVisible({ timeout: 15000 })
        errors.length = 0

        await rageClick(endBtn)

        await expect(connectedMarker(page)).toHaveCount(0, { timeout: 20000 })
        expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
      } finally {
        await page.close()
        await ctx.close()
        await cleanupScheduledMeetingEvent(setup)
        await waitForActiveMeetingsToFinish()
      }
    })

    test('EditMeetingData reset sends one tx, not three (wire)', async ({ browser }) => {
      test.setTimeout(60000)
      // Reset only needs `meetingDoc.status === Finished`; written directly, no LiveKit session
      // needed (unlike Start/End above) - the same stale-read diffUpdate shape as the privacy
      // toggle, so "once" is only observable on the wire (see `enableJsonProtocol` above).
      const setup = await createScheduledMeetingEvent('Meeting Room 1', MeetingStatus.Finished)
      const ctx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page = await ctx.newPage()
      await enableJsonProtocol(page)
      const tx = trackTxFrames(page)

      try {
        await openCalendarEventPanel(page, setup.eventTitle)
        const resetBtn = page.locator('div.flex-col.mt-2').getByRole('button')
        await expect(resetBtn).toBeVisible({ timeout: 15000 })
        tx.frames.length = 0

        await rageClick(resetBtn)

        await expect.poll(() => countMatchingTx(tx.frames, setup.meetingId, 'status')).toBeGreaterThanOrEqual(1)
        await page.waitForTimeout(500)
        const txCount = countMatchingTx(tx.frames, setup.meetingId, 'status')
        expect(txCount, `expected exactly one "status" tx, frames: ${JSON.stringify(tx.frames)}`).toBe(1)
      } finally {
        await page.close()
        await ctx.close()
        await cleanupScheduledMeetingEvent(setup)
      }
    })
  })
}
