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
import love, { type ParticipantInfo } from '@hcengineering/love'
import {
  clickRoomByName,
  closeLoveWindows,
  closeMeetingContexts,
  firstAvailableRoom,
  getMeetingsUser,
  getSystemRestClient,
  loveWindow,
  occupiedCells,
  openLove,
  startOrJoin,
  waitConnected,
  waitForActiveMeetingsToFinish,
  waitRoomMeeting,
  type LoveUser,
  type LoveWindow
} from './meeting-helpers'

/**
 * A tile is `<div id={person}>` inside `.video` - see `ParticipantView.svelte`. The id is the
 * `Ref<Person>`, which is also what the love service uses as the LiveKit identity.
 */
function tiles (page: Page): ReturnType<Page['locator']> {
  return page.locator('.video > div.parent')
}

function tileOf (page: Page, person: string): ReturnType<Page['locator']> {
  return page.locator(`.video > div.parent[id="${person}"]`)
}

export function registerParticipantTilesTests (): void {
  test.describe('meeting minutes - participant tiles', () => {
    // Not a client-side assertion: the tile comes back because the love service rebuilds the row.
    // `reconcileParticipants` (services/love/src/polling.ts) walks the live LiveKit participants and
    // re-creates a `ParticipantInfo` that has no row - the repair for a lost `participant_joined`.
    test('the service restores a deleted ParticipantInfo and the tile returns', async ({ browser }) => {
      test.setTimeout(90000)

      const { ctx: ctx2, page: page2 } = await loveWindow(browser, 'second')
      const { ctx: ctx3, page: page3 } = await loveWindow(browser, 'third')
      try {
        const room = await firstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')

        await clickRoomByName(page2, room as string)
        await startOrJoin(page2)
        await waitConnected(page2)

        await clickRoomByName(page3, room as string)
        await startOrJoin(page3)
        await waitConnected(page3)

        const meeting = await waitRoomMeeting(room as string)
        const sys = await getSystemRestClient()

        await expect
          .poll(
            async () =>
              (await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })).length,
            { timeout: 30000 }
          )
          .toBe(2)
        await expect.poll(async () => await tiles(page2).count(), { timeout: 30000 }).toBe(2)

        // The row that is not user2's own belongs to user3.
        const { account: account2 } = await getMeetingsUser()
        const infos = await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })
        const victim = infos.find((it) => it.account !== account2)
        expect(victim).toBeDefined()
        const { _id, space, person } = victim as ParticipantInfo

        // Drop the row the way a lost `participant_joined` webhook would leave it. user3's LiveKit
        // session stays up, so the next poll finds a live participant with no row of its own.
        await sys.removeDoc(love.class.ParticipantInfo, space, _id)
        // Without this the test proves nothing: a `removeDoc` the server rejects would leave the
        // row in place and every assertion below would pass on state that never changed.
        expect(await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { _id })).toHaveLength(0)

        // The row - and with it the tile - must come back without user3 doing anything. The window
        // is the poll interval, hence the generous timeout.
        await expect
          .poll(
            async () =>
              (await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id, person })).length,
            { timeout: 60000 }
          )
          .toBe(1)
        await expect(tileOf(page2, person)).toBeVisible({ timeout: 30000 })
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })
  })

  /**
   * The reported scenario: one person starts a meeting and four more join one after another. The
   * complaint is about the people already sitting in the room - a newcomer is heard but paints no
   * tile for them - so every window is re-checked after each join, not only at the end.
   */
  test.describe('meeting minutes - five participants', () => {
    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('five participants joining one by one all see each other', async ({ browser }) => {
      test.setTimeout(300000)

      const users: LoveUser[] = ['first', 'second', 'third', 'fourth', 'fifth']
      const windows: LoveWindow[] = []
      try {
        for (const user of users) {
          windows.push(await loveWindow(browser, user))
        }
        const [host] = windows

        const room = await firstAvailableRoom(host.page)
        test.skip(room === null, 'No regular room available')

        await clickRoomByName(host.page, room as string)
        await startOrJoin(host.page)
        await waitConnected(host.page)

        const meeting = await waitRoomMeeting(room as string)
        const sys = await getSystemRestClient()

        const joined = [host]
        for (const next of windows.slice(1)) {
          await clickRoomByName(next.page, room as string)
          await startOrJoin(next.page)
          await waitConnected(next.page)
          joined.push(next)

          // The server's roster first - a tile that never appears because the row is missing is a
          // different defect from a tile the client failed to paint, and this separates them.
          await expect
            .poll(
              async () =>
                (await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })).length,
              { timeout: 60000 }
            )
            .toBe(joined.length)

          const persons = (
            await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })
          ).map((it) => it.person)

          // Everyone already in the room must see the newcomer, and the newcomer must see everyone.
          for (const seated of joined) {
            await expect.poll(async () => await tiles(seated.page).count(), { timeout: 60000 }).toBe(joined.length)
            for (const person of persons) {
              await expect(tileOf(seated.page, person)).toBeVisible({ timeout: 15000 })
            }
          }
        }

        // Five people, five distinct cells on the floor grid: `prepareInfo` spreads colliding
        // coordinates, and a collapsed pair here is the "avatars stack in one cell" defect.
        for (const w of windows) {
          await expect.poll(async () => await occupiedCells(w.page, room as string), { timeout: 60000 }).toBe(5)
        }
      } finally {
        await closeMeetingContexts(windows.map(({ ctx, page }) => ({ ctx, pages: [page] })))
      }
    })
  })

  /**
   * The reporter's second step: reload a tab while the meeting runs. A reload re-mounts
   * `ParticipantsListView`, whose `onMount` rebuilds `lkitParticipants` from `lk.remoteParticipants`
   * - the only thing that repairs a tile the client never learned about.
   */
  test.describe('meeting minutes - participant tiles across a reload', () => {
    // Own contexts for the same accounts the shared windows hold: two sessions per user break
    // presence, and a reload mid-meeting is what made `refresh-reconnect` flaky on a reused window.
    test.beforeAll(async () => {
      await closeLoveWindows()
    })

    test.beforeEach(async () => {
      await waitForActiveMeetingsToFinish()
    })

    test('a reload during the meeting brings every tile back', async ({ browser }) => {
      test.setTimeout(120000)

      const ctx2 = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const page2 = await ctx2.newPage()
      const ctx3 = await browser.newContext({ storageState: '.auth/storageThird.json' })
      const page3 = await ctx3.newPage()
      try {
        await openLove(page2)
        const room = await firstAvailableRoom(page2)
        test.skip(room === null, 'No regular room available')

        await clickRoomByName(page2, room as string)
        await startOrJoin(page2)
        await waitConnected(page2)

        await openLove(page3)
        await clickRoomByName(page3, room as string)
        await startOrJoin(page3)
        await waitConnected(page3)

        const meeting = await waitRoomMeeting(room as string)
        const sys = await getSystemRestClient()
        await expect
          .poll(
            async () =>
              (await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })).length,
            { timeout: 30000 }
          )
          .toBe(2)
        await expect.poll(async () => await tiles(page2).count(), { timeout: 30000 }).toBe(2)

        const persons = (await sys.findAll<ParticipantInfo>(love.class.ParticipantInfo, { meeting: meeting._id })).map(
          (it) => it.person
        )

        await page2.reload({ waitUntil: 'load' })
        await expect(page2.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 60000 })

        // Both tiles must be painted again. A remote participant who is audible but missing from
        // the grid after a reload is the reported defect.
        await expect.poll(async () => await tiles(page2).count(), { timeout: 60000 }).toBe(2)
        for (const person of persons) {
          await expect(tileOf(page2, person)).toBeVisible({ timeout: 10000 })
        }
      } finally {
        await closeMeetingContexts([
          { ctx: ctx2, pages: [page2] },
          { ctx: ctx3, pages: [page3] }
        ])
      }
    })
  })
}
