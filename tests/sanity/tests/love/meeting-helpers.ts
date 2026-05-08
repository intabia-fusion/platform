//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import type { BrowserContext, Page } from '@playwright/test'

/**
 * Click "Leave" on the page if it's currently inside a meeting. Use in test
 * teardown so no LiveKit session is left active between tests — stale
 * ParticipantInfo on the server can race the next test's `connect()`
 * (LiveKit identity collision, DTLS handshake on top of a half-closed
 * session). Errors during teardown are swallowed.
 */
export async function leaveIfInMeeting (page: Page): Promise<void> {
  const widget = page.locator('[data-id="meeting-widget"]')
  try {
    if ((await widget.count()) === 0) return
    if (!(await widget.first().isVisible().catch(() => false))) return
    const leave = page.locator('[data-id="meeting-leave"]').first()
    if ((await leave.count()) === 0) return
    await leave.click({ timeout: 5000 }).catch(() => undefined)
    await widget.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined)
  } catch {
    // Page was already closed or in a state where leave is impossible.
  }
}

export async function leaveAllMeetings (pages: Page[]): Promise<void> {
  await Promise.all(pages.map(leaveIfInMeeting))
}

/**
 * Test teardown helper: leave any active meeting on each page, then close
 * pages and contexts. Use in `finally` of every meeting test that opened
 * extra contexts. This avoids leaving LiveKit sessions half-closed between
 * tests, which causes DTLS handshake timeouts on the next connect().
 */
export async function closeMeetingContexts (entries: Array<{ ctx: BrowserContext, pages: Page[] }>): Promise<void> {
  for (const { pages } of entries) {
    await leaveAllMeetings(pages)
  }
  for (const { pages } of entries) {
    for (const p of pages) await p.close().catch(() => undefined)
  }
  for (const { ctx } of entries) {
    await ctx.close().catch(() => undefined)
  }
}
