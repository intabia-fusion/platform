//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { createRestClient, getWorkspaceToken, loadServerConfig, type RestClient } from '@hcengineering/api-client'
import love, { MeetingStatus, type MeetingMinutes, type ParticipantInfo } from '@hcengineering/love'
import { PlatformURI, PlatformUserSecond } from '../utils'
import type { BrowserContext, Page } from '@playwright/test'

const MEETINGS_WS = 'meetings-ws'

let cachedRestClient: RestClient | undefined

async function getMeetingsRestClient (): Promise<RestClient> {
  if (cachedRestClient !== undefined) return cachedRestClient
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUserSecond, password: '1234', workspace: MEETINGS_WS },
    config
  )
  cachedRestClient = createRestClient(token.endpoint, token.workspaceId, token.token)
  return cachedRestClient
}

/**
 * Poll the transactor (via REST) until no MeetingMinutes is Active or
 * Pending — i.e. the previous test's meeting has been Finished by the
 * LiveKit `room_finished` webhook (which fires after the 3s
 * departureTimeout). Reusing the still-Pending meeting in the next test
 * would carry over the prior owners/members and break owner-only and
 * locked-room checks.
 */
export async function waitForActiveMeetingsToFinish (timeoutMs = 20000): Promise<void> {
  const client = await getMeetingsRestClient()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [meetings, participants] = await Promise.all([
      client.findAll<MeetingMinutes>(
        love.class.MeetingMinutes,
        { status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] } },
        { limit: 1 }
      ),
      // Drain *all* ParticipantInfo — a leftover PI in a non-Reception room
      // makes the office owner appear "in a meeting" on the next test's
      // floor grid (the office cell renders without the resolved name) and
      // also tricks the server's knock detection.
      client.findAll<ParticipantInfo>(love.class.ParticipantInfo, {}, { limit: 1 })
    ])
    if (meetings.length === 0 && participants.length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

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
    if (
      !(await widget
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      return
    }
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
  // Server-side: wait for the LiveKit `room_finished` webhook to fire, the
  // meeting to be marked Finished and the resulting ParticipantInfo cleanup
  // to land. Without this the next test sees stale PIs (the owner is "still
  // in a meeting") and floor-grid rendering misses their office.
  await waitForActiveMeetingsToFinish()
}
