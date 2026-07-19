//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { createRestClient, getWorkspaceToken, loadServerConfig, type RestClient } from '@hcengineering/api-client'
import { systemAccountUuid } from '@hcengineering/core'
import love, {
  MeetingStatus,
  type MeetingMinutes,
  type ParticipantInfo,
  type UserMeetingInvite
} from '@hcengineering/love'
import { generateToken } from '@hcengineering/server-token'
import { PlatformURI, PlatformUserSecond } from '../utils'
import type { BrowserContext, Page } from '@playwright/test'

const MEETINGS_WS = 'meetings-ws'

let cachedRestClient: RestClient | undefined
let cachedSystemRestClient: RestClient | undefined

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

/**
 * Active drain of leftover UserMeetingInvite documents — bypasses the 30s
 * TransientTTL. Uses a system-token REST client because invites live in
 * per-user PersonSpaces (only the owner — or system — can removeDoc).
 */
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

/**
 * Force-finish every Active/Pending MeetingMinutes and drop all ParticipantInfo
 * straight from the transactor — skips the 3s LK departureTimeout + the
 * room_finished webhook entirely. The love service's own finishMeeting() does
 * exactly this on receiving the webhook, but in tests we don't need to
 * exercise that path; we just want a clean slate for the next test.
 */
async function forceFinishAllMeetings (): Promise<void> {
  try {
    const sys = await getSystemRestClient()
    const [meetings, participants] = await Promise.all([
      sys.findAll<MeetingMinutes>(love.class.MeetingMinutes, {
        status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] }
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
  await Promise.all([forceFinishAllMeetings(), drainPendingInvites()])
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [meetings, participants, invites] = await Promise.all([
      client.findAll<MeetingMinutes>(
        love.class.MeetingMinutes,
        { status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] } },
        { limit: 1 }
      ),
      // Drain *all* ParticipantInfo — a leftover PI in a non-Reception room
      // makes the office owner appear "in a meeting" on the next test's
      // floor grid (the office cell renders without the resolved name) and
      // also tricks the server's knock detection.
      client.findAll<ParticipantInfo>(love.class.ParticipantInfo, {}, { limit: 1 }),
      // Drain UserMeetingInvite — stale invites from a previous test (a
      // request/response that wasn't cleaned up because the meeting was
      // never created or the recipient's accept tx was lost) trip up
      // toHaveCount/toBeHidden assertions in subsequent tests.
      client.findAll<UserMeetingInvite>(love.class.UserMeetingInvite, {}, { limit: 1 })
    ])
    if (meetings.length === 0 && participants.length === 0 && invites.length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

/**
 * No-op in the new lifecycle: the page is about to close anyway, and the
 * LiveKit `participant_left` webhook (fired on socket disconnect) drives
 * the server-side cleanup of ParticipantInfo + MeetingMinutes status.
 * Kept as a thin shim so existing call sites don't have to change.
 */
export async function leaveIfInMeeting (_page: Page): Promise<void> {
  // Intentionally empty.
}

export async function leaveAllMeetings (_pages: Page[]): Promise<void> {
  // Intentionally empty — see leaveIfInMeeting.
}

/**
 * Test teardown helper: leave any active meeting on each page, then close
 * pages and contexts. Use in `finally` of every meeting test that opened
 * extra contexts. This avoids leaving LiveKit sessions half-closed between
 * tests, which causes DTLS handshake timeouts on the next connect().
 */
export async function closeMeetingContexts (entries: Array<{ ctx: BrowserContext, pages: Page[] }>): Promise<void> {
  // Close every page in parallel; the sequential loop was adding ~200-400ms
  // per extra context. Page.close drives the WS disconnect which the love
  // service relies on to fire the `participant_left` webhook — but the
  // webhook fires asynchronously anyway, so we don't need to serialise.
  const allPages = entries.flatMap((e) => e.pages)
  await Promise.all(allPages.map((p) => p.close().catch(() => undefined)))
  await Promise.all(entries.map(({ ctx }) => ctx.close().catch(() => undefined)))
  // Server-side: wait for the LiveKit `room_finished` webhook to fire, the
  // meeting to be marked Finished and the resulting ParticipantInfo cleanup
  // to land. Without this the next test sees stale PIs (the owner is "still
  // in a meeting") and floor-grid rendering misses their office.
  await waitForActiveMeetingsToFinish()
}
