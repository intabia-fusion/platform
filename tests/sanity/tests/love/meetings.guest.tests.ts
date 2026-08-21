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

import {
  clickFirstAvailableRoom,
  closeMeetingContexts,
  occupiedCells,
  openLove,
  startOrJoin,
  waitConnected,
  waitForActiveMeetingsToFinish
} from './meeting-helpers'

async function openMeetingMinutes (page: Page, roomName: string): Promise<void> {
  // Pick the link by its href — the floor view also renders a link with
  // the same visible name pointing to the Room itself, and clicking it
  // would land us on a page without the EditDoc header.
  const link = page
    .locator('a[href*="MeetingMinutes"]')
    .filter({ hasText: new RegExp(`${roomName}.*20\\d{2}`) })
    .first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
  await expect(page.locator('div.hulyHeader-container').first()).toBeVisible({ timeout: 15000 })
}

/**
 * Drives the host UI through the same action a real user would invoke:
 * EditDoc header's More Actions button -> "Copy guest link". The action
 * writes the resolved URL to the system clipboard, which the test then
 * reads back. Playwright pre-grants clipboard permissions in
 * `playwright.config.ts`, and the host page is focused while the test
 * runs, so the clipboard read succeeds even though it fails when the
 * page loses focus.
 */
async function copyGuestLinkViaUi (page: Page): Promise<string> {
  // Header actions live in `hulyHeader-buttonsGroup.actions`; the
  // editor body has additional `btnMoreActions` buttons (one per
  // attachment etc.), so we scope to the header to pick the right one.
  // The EditDoc renders TWO `.hulyHeader-buttonsGroup.actions` blocks (the
  // floor-view header + the panel header); the one we need is the panel
  // header that hosts the More Actions button.
  const moreActions = page
    .locator('.hulyHeader-container .hulyHeader-buttonsGroup.actions [data-id="btnMoreActions"]')
    .first()
  await expect(moreActions).toBeVisible({ timeout: 15000 })
  await moreActions.click()

  // The actions menu renders as `.antiPopup` containing `button.ap-menuItem`s.
  // The video-meeting widget also renders as `.antiPopup`, so we cannot
  // narrow by class alone — pick the popup that actually contains the
  // "Copy guest link" item.
  const copyItem = page
    .locator('.antiPopup button.ap-menuItem')
    .filter({ hasText: /copy guest link/i })
    .first()
  await expect(copyItem).toBeVisible({ timeout: 5000 })

  // The link lands only after a round-trip for the guest token; until then the clipboard still
  // holds the previous test's link, which matches the shape and points at a finished meeting.
  const readClipboard = async (): Promise<string> =>
    await page.evaluate(async () => await navigator.clipboard.readText())
  const before = await readClipboard()
  await copyItem.click()

  let url = before
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    url = await readClipboard()
    if (url !== before && /\/meetings(\/|\?)/.test(url)) return url
    await page.waitForTimeout(100)
  }
  throw new Error(`clipboard did not receive a fresh guest URL, still: ${url}`)
}

/** Fills the guest form and waits for the connected LiveKit view. */
async function guestJoin (guest: Page, url: string, first: string, last: string): Promise<void> {
  await (await guest.goto(url))?.finished()
  const firstName = guest.locator('input[name="first_name"]')
  await expect(firstName).toBeVisible({ timeout: 30000 })
  await firstName.fill(first)
  await guest.locator('input[name="last_name"]').fill(last)
  await guest.locator('[data-testid="checkbox-personal-data"]').check()
  await guest.locator('[data-testid="checkbox-rules"]').check()
  const joinBtn = guest.getByRole('button', { name: /join meeting/i }).first()
  await expect(joinBtn).toBeEnabled({ timeout: 10000 })
  await joinBtn.click()
  await expect(guest.locator('[data-id="guest-connected"]')).toBeVisible({ timeout: 45000 })
}

export function registerGuestTests (): void {
  test.describe('meeting minutes - guest flow', () => {
    test('guest joins via shared link: form -> "Join meeting" -> connected widget (no Abort handler)', async ({
      browser
    }) => {
      test.setTimeout(60000)

      // Host context — must already have storage state with login.
      const hostCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      // Guest context — fully anonymous (no storage, no token).
      const guestCtx = await browser.newContext({ storageState: undefined })
      const host = await hostCtx.newPage()
      const guest = await guestCtx.newPage()

      // Surface guest-side runtime errors directly into the test failure so a
      // regression like "could not establish signal connection: Abort handler
      // called" is attributed clearly.
      const guestErrors: string[] = []
      guest.on('pageerror', (err) => guestErrors.push(err.message))
      guest.on('console', (msg) => {
        if (msg.type() === 'error') guestErrors.push(msg.text())
      })

      try {
        // Host starts a meeting in the first available regular room.
        await openLove(host)
        const room = await clickFirstAvailableRoom(host)
        test.skip(room === null, 'No regular room available for guest test')
        await startOrJoin(host)
        await waitConnected(host)

        // Open the meeting minutes editor and copy the guest link via the
        // header More Actions menu — exactly the UI path a host would use.
        await openMeetingMinutes(host, room as string)
        const guestUrl = await copyGuestLinkViaUi(host)

        // Guest navigates to the link, fills in name and joins. Permissions are
        // pre-warmed by the popup before LiveKit signal connect — the test stand
        // launches Chromium with --use-fake-ui-for-media-stream, so the
        // permission prompt resolves instantly, but the same code path also
        // covers production where the dialog may hang.
        await (await guest.goto(guestUrl))?.finished()

        const first = guest.locator('input[name="first_name"]')
        const last = guest.locator('input[name="last_name"]')
        await expect(first).toBeVisible({ timeout: 30000 })
        await first.fill('Guest')
        await last.fill('Tester')

        // The shared AuthLikeForm requires both consent checkboxes to be
        // ticked before its proceed button enables.
        await guest.locator('[data-testid="checkbox-personal-data"]').check()
        await guest.locator('[data-testid="checkbox-rules"]').check()

        const joinBtn = guest.getByRole('button', { name: /join meeting/i }).first()
        await expect(joinBtn).toBeEnabled({ timeout: 10000 })
        await joinBtn.click()

        // After successful join GuestMeetingApp swaps to its connected branch
        // and renders the LiveKit room container we tag with `guest-connected`.
        await expect(guest.locator('[data-id="guest-connected"]')).toBeVisible({ timeout: 45000 })

        // No "Abort handler called" in the console either.
        const abort = guestErrors.find((m) => /Abort handler called/i.test(m))
        expect(abort, `guest console error: ${abort}`).toBeUndefined()
      } finally {
        // Leave host meeting via standard widget control, then close contexts.
        await closeMeetingContexts([
          { ctx: hostCtx, pages: [host] },
          { ctx: guestCtx, pages: [guest] }
        ])
      }
    })

    test('guest shows up as a participant for the host and disappears on leave', async ({ browser }) => {
      test.setTimeout(90000)
      const hostCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const guestCtx = await browser.newContext({ storageState: undefined })
      const host = await hostCtx.newPage()
      const guest = await guestCtx.newPage()
      try {
        await openLove(host)
        const room = await clickFirstAvailableRoom(host)
        test.skip(room === null, 'No regular room available for guest test')
        await startOrJoin(host)
        await waitConnected(host)

        await openMeetingMinutes(host, room as string)
        const guestUrl = await copyGuestLinkViaUi(host)
        await guestJoin(guest, guestUrl, 'Seen', 'Guest')

        // The host side must account for the guest: the room the host is in
        // now renders two occupied cells on the floor grid.
        await expect
          .poll(async () => await occupiedCells(host, room as string), { timeout: 30000 })
          .toBeGreaterThanOrEqual(2)

        await guest.close()

        // ParticipantInfo for the guest is dropped by the participant_left
        // webhook once LiveKit's departureTimeout (3s) elapses.
        await expect.poll(async () => await occupiedCells(host, room as string), { timeout: 30000 }).toBe(1)
      } finally {
        await closeMeetingContexts([
          { ctx: hostCtx, pages: [host] },
          { ctx: guestCtx, pages: [guest] }
        ])
      }
    })

    test('two guests on the same link land in the same meeting', async ({ browser }) => {
      test.setTimeout(120000)
      const hostCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const g1Ctx = await browser.newContext({ storageState: undefined })
      const g2Ctx = await browser.newContext({ storageState: undefined })
      const host = await hostCtx.newPage()
      const g1 = await g1Ctx.newPage()
      const g2 = await g2Ctx.newPage()
      try {
        await openLove(host)
        const room = await clickFirstAvailableRoom(host)
        test.skip(room === null, 'No regular room available for guest test')
        await startOrJoin(host)
        await waitConnected(host)

        await openMeetingMinutes(host, room as string)
        const guestUrl = await copyGuestLinkViaUi(host)

        await guestJoin(g1, guestUrl, 'First', 'Guest')
        await guestJoin(g2, guestUrl, 'Second', 'Guest')

        // One shared link, one meeting: host + two guests occupy three cells.
        await expect
          .poll(async () => await occupiedCells(host, room as string), { timeout: 30000 })
          .toBeGreaterThanOrEqual(3)
      } finally {
        await closeMeetingContexts([
          { ctx: hostCtx, pages: [host] },
          { ctx: g1Ctx, pages: [g1] },
          { ctx: g2Ctx, pages: [g2] }
        ])
      }
    })

    test('guest link is refused once the meeting has finished', async ({ browser }) => {
      test.setTimeout(120000)
      const hostCtx = await browser.newContext({ storageState: '.auth/storageSecond.json' })
      const guestCtx = await browser.newContext({ storageState: undefined })
      const host = await hostCtx.newPage()
      const guest = await guestCtx.newPage()
      try {
        await openLove(host)
        const room = await clickFirstAvailableRoom(host)
        test.skip(room === null, 'No regular room available for guest test')
        await startOrJoin(host)
        await waitConnected(host)

        await openMeetingMinutes(host, room as string)
        const guestUrl = await copyGuestLinkViaUi(host)

        // Host leaves; the LiveKit room empties and the meeting is finished by
        // the room_finished webhook after departureTimeout.
        await host.close()
        await waitForActiveMeetingsToFinish()

        await (await guest.goto(guestUrl))?.finished()

        // `/guestInfo` reports Finished, so GuestMeetingApp renders the closing
        // notice instead of the join form - the guest never gets a token.
        await expect(guest.getByText(/finished/i).first()).toBeVisible({ timeout: 30000 })
        expect(await guest.locator('input[name="first_name"]').count()).toBe(0)
        expect(await guest.locator('[data-id="guest-connected"]').count()).toBe(0)
      } finally {
        await closeMeetingContexts([
          { ctx: hostCtx, pages: [host] },
          { ctx: guestCtx, pages: [guest] }
        ])
      }
    })
  })
}
