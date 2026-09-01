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

import { createRestClient, getWorkspaceToken, loadServerConfig, type RestClient } from '@hcengineering/api-client'
import { type AccountUuid, systemAccountUuid } from '@hcengineering/core'
import love, {
  MeetingStatus,
  type MeetingMinutes,
  type ParticipantInfo,
  type UserMeetingInvite
} from '@hcengineering/love'
import { generateToken } from '@hcengineering/server-token'
import { PlatformURI, PlatformUserSecond } from '../utils'
import { retryIntervals } from '../retry'
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { OfficePage } from '../model/love/office-page'

const MEETINGS_WS = 'meetings-ws'

let cachedRestClient: RestClient | undefined
let cachedAccount: AccountUuid | undefined
let cachedSystemRestClient: RestClient | undefined

async function getMeetingsRestClient (): Promise<RestClient> {
  return (await getMeetingsUser()).client
}

/** REST client for PlatformUserSecond plus that account's uuid (needed to write per-account docs). */
export async function getMeetingsUser (): Promise<{ client: RestClient, account: AccountUuid }> {
  if (cachedRestClient !== undefined && cachedAccount !== undefined) {
    return { client: cachedRestClient, account: cachedAccount }
  }
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUserSecond, password: '1234', workspace: MEETINGS_WS },
    config
  )
  cachedRestClient = createRestClient(token.endpoint, token.workspaceId, token.token)
  cachedAccount = token.info.account
  return { client: cachedRestClient, account: cachedAccount }
}

/** Raw workspace JWT for PlatformUserSecond - the same Bearer the browser sends to `/_love/*`. */
export async function getPlatformToken (): Promise<string> {
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUserSecond, password: '1234', workspace: MEETINGS_WS },
    config
  )
  return token.token
}

export function loveEndpoint (): string {
  return `${(PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')}/_love`
}

export async function getSystemRestClient (): Promise<RestClient> {
  if (cachedSystemRestClient !== undefined) return cachedSystemRestClient
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUserSecond, password: '1234', workspace: MEETINGS_WS },
    config
  )
  const systemToken = generateToken(systemAccountUuid, token.workspaceId, undefined, 'secret')
  cachedSystemRestClient = createRestClient(token.endpoint, token.workspaceId, systemToken)
  return cachedSystemRestClient
}

/** Drains leftover invites past their 30s TTL. Needs a system token: invites live in
 *  per-user PersonSpaces, where only the owner or system may removeDoc. */
async function drainPendingInvites (): Promise<void> {
  try {
    const sys = await getSystemRestClient()
    const all = await sys.findAll<UserMeetingInvite>(love.class.UserMeetingInvite, {})
    await Promise.all(
      all.map((it) => sys.removeDoc(love.class.UserMeetingInvite, it.space, it._id).catch(() => undefined))
    )
  } catch {
    // Best-effort; if system token isn't configured the polling loop below
    // still drains via TTL (just slower).
  }
}

/** Force-finishes every non-Finished meeting through the transactor: the `room_finished`
 *  webhook is not the path tests care about, and a leftover Scheduled one hijacks Connect. */
async function forceFinishAllMeetings (): Promise<void> {
  try {
    const sys = await getSystemRestClient()
    const [meetings, participants] = await Promise.all([
      sys.findAll<MeetingMinutes>(love.class.MeetingMinutes, {
        status: { $in: [MeetingStatus.Active, MeetingStatus.Pending, MeetingStatus.Scheduled] }
      }),
      sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, {})
    ])
    await Promise.all([
      ...meetings.map((m) =>
        sys
          .updateDoc(love.class.MeetingMinutes, m.space, m._id, {
            status: MeetingStatus.Finished,
            meetingEnd: Date.now()
          })
          .catch(() => undefined)
      ),
      ...participants.map((p) => sys.removeDoc(love.class.ParticipantInfo, p.space, p._id).catch(() => undefined))
    ])
  } catch {
    // Best-effort; polling loop below covers the slow path.
  }
}

/** Waits until no meeting is Active or Pending: a leftover one carries its owners and
 *  members into the next test and breaks owner-only and locked-room checks. */
export async function waitForActiveMeetingsToFinish (timeoutMs = 20000): Promise<void> {
  const client = await getMeetingsRestClient()
  await Promise.all([forceFinishAllMeetings(), drainPendingInvites()])
  const deadline = Date.now() + timeoutMs
  let left = 'nothing'
  while (Date.now() < deadline) {
    const [meetings, participants, invites] = await Promise.all([
      client.findAll<MeetingMinutes>(
        love.class.MeetingMinutes,
        { status: { $in: [MeetingStatus.Active, MeetingStatus.Pending, MeetingStatus.Scheduled] } },
        { limit: 1 }
      ),
      // A leftover row makes the office owner look "in a meeting" on the next test's floor
      // grid and fools the server's knock detection.
      client.findAll<ParticipantInfo>(love.class.ParticipantInfo, {}, { limit: 1 }),
      // Stale invites from a previous test trip up `toHaveCount`/`toBeHidden` in the next
      // one.
      client.findAll<UserMeetingInvite>(love.class.UserMeetingInvite, {}, { limit: 1 })
    ])
    if (meetings.length === 0 && participants.length === 0 && invites.length === 0) return
    left = `meetings=${meetings.length} participants=${participants.length} invites=${invites.length}`
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  // Falling out of the loop leaves the next test on dirty state - it then fails seconds later on
  // some unrelated locator with nothing pointing back here.
  console.warn(`[love] cleanup did not settle in ${timeoutMs}ms, still there: ${left}`)
}

// `sendKnockRequest` returns silently until the employee and their space resolve, so an early
// click creates nothing. Re-clicking is safe: the apply carries `notMatch` on a pending request.
export async function knockAndWaitPending (page: Page, timeoutMs = 30000): Promise<void> {
  const knockBtn = page.locator('[data-id="meeting-knock"]').first()
  const pending = page.locator('[data-id="meeting-knock-pending"]').first()
  await expect(async () => {
    if (await pending.isVisible()) return
    await knockBtn.click({ timeout: 5000 })
    await expect(pending).toBeVisible({ timeout: 5000 })
  }).toPass({ intervals: retryIntervals, timeout: timeoutMs })
}

/** Closes pages and contexts in `finally`. A half-closed LiveKit session causes DTLS
 *  handshake timeouts on the next connect. */
export async function closeMeetingContexts (entries: Array<{ ctx: BrowserContext, pages: Page[] }>): Promise<void> {
  // In parallel: the sequential loop cost 200-400ms per context, and the webhook that
  // `Page.close` triggers fires asynchronously anyway.
  const allPages = entries.flatMap((e) => e.pages)
  await Promise.all(allPages.map((p) => p.close().catch(() => undefined)))
  await Promise.all(entries.map(({ ctx }) => ctx.close().catch(() => undefined)))
  // Wait for `room_finished` and its ParticipantInfo cleanup, or the next test sees the
  // owner as "still in a meeting" and the floor grid misses their office.
  await waitForActiveMeetingsToFinish()
}

export const ROOM_CANDIDATES = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']

/** Either surface proves the LiveKit session is live: the sidebar widget is not
 *  rendered when the meeting opens in the main area. */
export function connectedMarker (page: Page): Locator {
  return page
    .locator('[data-id="meeting-widget"], [data-id="control-bar"][data-connected="true"]')
    .locator('visible=true')
}

/** Grid cells of a room that currently render a participant avatar. */
export async function occupiedCells (page: Page, roomName: string): Promise<number> {
  return await page.locator(`[data-id="room-${roomName}"] .floorGrid-room__field:has(.hulyAvatar-container)`).count()
}

export async function openLove (page: Page): Promise<OfficePage> {
  const office = new OfficePage(page)
  await (await page.goto(`${PlatformURI}/workbench/${MEETINGS_WS}/love`))?.finished()
  await expect(office.floorGrid()).toBeVisible({ timeout: 15000 })
  return office
}

/** Either surface counts as connected, so this also covers a meeting opened in the main area. */
export async function waitConnected (page: Page, timeout = 60000): Promise<void> {
  await expect.poll(async () => await connectedMarker(page).count(), { timeout }).toBeGreaterThan(0)
}

export async function startOrJoin (page: Page, timeout = 30000): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout })
  await connect.click()
}

/** The floor renders a link to the Room next to the one to its MeetingMinutes; pick by the date. */
export async function openMeetingMinutes (page: Page, roomName: string, pick: 'first' | 'last' = 'last'): Promise<void> {
  const links = page.getByRole('link', { name: new RegExp(`${roomName}.*20\\d{2}`) })
  const link = pick === 'first' ? links.first() : links.last()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
}

export async function clickOfficeOf (page: Page, lastName: string): Promise<Locator> {
  const office = page
    .locator('div.floorGrid-room')
    .filter({ hasText: new RegExp(lastName, 'i') })
    .first()
  await expect(office).toBeVisible({ timeout: 15000 })
  await office.click()
  return office
}

export async function joinRoom (page: Page, name: string, timeout = 45000): Promise<void> {
  await page.locator(`[data-id="room-${name}"]`).first().click()
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
  await expect.poll(async () => await connectedMarker(page).count(), { timeout }).toBeGreaterThan(0)
}

/** Waits for each candidate: `count()` does not, and under load the grid paints before its
 *  rooms, so a run silently lands on a different room than the one before. */
export async function firstAvailableRoom (page: Page, exclude: string[] = []): Promise<string | null> {
  for (const name of ROOM_CANDIDATES) {
    if (exclude.includes(name)) continue
    const present = await page
      .locator(`[data-id="room-${name}"]`)
      .first()
      .waitFor({ state: 'attached', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    if (present) return name
  }
  return null
}

/** The live MeetingMinutes of a room, once the server has created it. */
export async function waitRoomMeeting (roomName: string, timeoutMs = 30000): Promise<MeetingMinutes> {
  const sys = await getSystemRestClient()
  const room = await sys.findOne(love.class.Room, { name: roomName })
  expect(room).toBeDefined()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const mm = await sys.findOne<MeetingMinutes>(love.class.MeetingMinutes, {
      roomId: room?._id,
      status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
    })
    if (mm !== undefined) return mm
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`No live MeetingMinutes for room ${roomName}`)
}

export async function joinFirstAvailableRoom (page: Page, timeout = 45000): Promise<boolean> {
  const name = await firstAvailableRoom(page)
  if (name === null) return false
  await joinRoom(page, name, timeout)
  return true
}

export async function clickRoomByName (page: Page, name: string): Promise<void> {
  await page.locator(`[data-id="room-${name}"]`).first().click()
}

export async function clickFirstAvailableRoom (page: Page, exclude: string[] = []): Promise<string | null> {
  const name = await firstAvailableRoom(page, exclude)
  if (name === null) return null
  await clickRoomByName(page, name)
  return name
}
