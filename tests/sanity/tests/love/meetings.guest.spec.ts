//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { expect, test, type Page } from '@playwright/test'
import { PlatformURI } from '../utils'
import { closeMeetingContexts } from './meeting-helpers'

const meetingsWs = 'meetings-ws'
const ROOM_CANDIDATES = ['Meeting Room 1', 'Meeting Room 2', 'All hands', 'Voice only room']

async function openLove (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/${meetingsWs}/love`))?.finished()
  await expect(page.locator('div.floorGrid')).toBeVisible({ timeout: 15000 })
}

async function clickFirstAvailableRoom (page: Page): Promise<string | null> {
  for (const name of ROOM_CANDIDATES) {
    const room = page.locator(`[data-id="room-${name}"]`).first()
    if ((await room.count()) === 0) continue
    await room.click()
    return name
  }
  return null
}

async function startOrJoin (page: Page): Promise<void> {
  const connect = page.locator('[data-id="meeting-connect"]').getByRole('button').first()
  await expect(connect).toBeVisible({ timeout: 10000 })
  await connect.click()
}

async function waitConnected (page: Page): Promise<void> {
  await expect(page.locator('[data-id="meeting-widget"]')).toBeVisible({ timeout: 30000 })
}

async function openMeetingMinutes (page: Page, roomName: string): Promise<void> {
  const link = page.getByRole('link', { name: new RegExp(`${roomName}.*20\\d{2}`) }).first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click()
}

/**
 * Right-clicks the meeting minutes link, picks "Copy guest link" from the
 * context menu and reads the resulting URL from the clipboard. The action is
 * registered on `love.class.MeetingMinutes` and writes the link to the
 * clipboard via `copyTextToClipboard` in love-resources.
 */
async function copyGuestLink (page: Page, roomName: string): Promise<string> {
  const link = page.getByRole('link', { name: new RegExp(`${roomName}.*20\\d{2}`) }).first()
  await expect(link).toBeVisible({ timeout: 15000 })
  await link.click({ button: 'right' })
  const copy = page
    .locator('.selectPopup, .antiPopup')
    .getByRole('button', { name: /copy guest link/i })
    .first()
  await expect(copy).toBeVisible({ timeout: 5000 })
  await copy.click()
  // small delay for the clipboard write to settle
  await page.waitForTimeout(200)
  const url = await page.evaluate(async () => navigator.clipboard.readText())
  expect(url).toMatch(/\/meetings(\/|\?)/)
  return url
}

test.describe('meeting minutes - guest flow', () => {
  test('guest joins via shared link: form -> "Join meeting" -> connected widget (no Abort handler)', async ({
    browser
  }) => {
    test.setTimeout(180000)

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

      // Open the meeting minutes for that room and copy the guest link.
      await openMeetingMinutes(host, room as string)
      const guestUrl = await copyGuestLink(host, room as string)

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

      const joinBtn = guest.getByRole('button', { name: /join meeting/i }).first()
      await expect(joinBtn).toBeEnabled({ timeout: 10000 })
      await joinBtn.click()

      // After successful join LiveKit is connected and the guest controls
      // render. The connected indicator is the data-id we add specifically
      // for this test path; falling back to the leave button keeps the test
      // resilient to minor UI reshuffles.
      await expect(guest.locator('[data-id="guest-connected"]')).toBeVisible({ timeout: 45000 })
      await expect(guest.locator('[data-id="guest-leave"]')).toBeVisible({ timeout: 5000 })

      // The error block on the guest popup must not surface the LiveKit
      // signal-abort message — that string is the exact regression signal.
      const errorText = await guest
        .locator('[data-id="guest-join-error"]')
        .first()
        .textContent()
        .catch(() => null)
      expect(errorText ?? '').not.toMatch(/Abort handler called|could not establish signal connection/i)

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
})
