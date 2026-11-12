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
import calendar, { getAllEvents, type Event } from '@hcengineering/calendar'
import type { Client, Timestamp } from '@hcengineering/core'
import { translate } from '@hcengineering/platform'
import { onClient } from '@hcengineering/presentation'
import love from './plugin'
import { joinMeetingBySession, seriesIdOf } from './meetings'
import { DEFAULT_MEETING_REMINDER } from './utils'

// The reminder is due when the lead time of a meeting occurrence runs out. Nothing on the server
// delivers it: there is no scheduler for calendar events, so the client that is open does.
const TICK_MS = 30 * 1000
// Occurrences are expanded for this window only - a reminder never fires earlier than its lead.
const LOOKAHEAD = 60 * 60 * 1000

const MIXIN_KEY = love.mixin.MeetingEventLink as string
const FIRED_KEY = 'love-meeting-reminders'

function firedKey (eventId: string, date: Timestamp): string {
  return `${eventId}:${date}`
}

function readFired (): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function rememberFired (fired: Set<string>): void {
  // The list only has to cover occurrences that may still be in the window, and dates are unique
  // enough to bound it by size rather than by time.
  const keep = Array.from(fired).slice(-200)
  localStorage.setItem(FIRED_KEY, JSON.stringify(keep))
}

async function show (event: Event, minutesLeft: number): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const body = await translate(love.string.MeetingReminderBody, {
    title: event.title,
    minutes: Math.max(1, Math.round(minutesLeft))
  })
  const notification = new Notification(event.title, { body, tag: `love-meeting-${event.eventId}` })
  notification.onclick = () => {
    window.focus()
    void joinMeetingBySession(seriesIdOf(event), 'event')
    notification.close()
  }
}

function leadOf (event: Event): number {
  const mixin = event as Event & { reminderBefore?: number }
  return mixin.reminderBefore ?? DEFAULT_MEETING_REMINDER
}

async function tick (client: Client): Promise<void> {
  const now = Date.now()
  // No `$or` here: the storage adapter for the workspace database does not translate it and the
  // query fails with `operator does not exist: text = text[]`. Masters of meetings are already a
  // small set, so a single `date` bound is enough - `getAllEvents` below drops whatever is outside
  // the window.
  const masters = await client.findAll(calendar.class.Event, {
    [MIXIN_KEY]: { $exists: true },
    date: { $lte: now + LOOKAHEAD }
  } as any)
  if (masters.length === 0) return

  const fired = readFired()
  const occurrences = getAllEvents(masters, now - TICK_MS, now + LOOKAHEAD)

  for (const occurrence of occurrences) {
    const lead = leadOf(occurrence)
    // 0 means the meeting is silent, an absent lead falls back to the default of the mixin.
    if (lead <= 0) continue
    const dueAt = occurrence.date - lead
    if (dueAt > now || occurrence.date <= now) continue

    const key = firedKey(occurrence.eventId, occurrence.date)
    if (fired.has(key)) continue
    fired.add(key)
    rememberFired(fired)

    await show(occurrence, (occurrence.date - now) / 60000)
  }
}

// One timer for the whole tab: `onClient` runs again after a re-login in the same tab, and a second
// interval would send every reminder twice. The client reference is kept fresh instead.
let timer: ReturnType<typeof setInterval> | undefined
let activeClient: Client | undefined

onClient((client) => {
  activeClient = client
  if (timer !== undefined) return
  // Permission is asked once, on the first meeting reminder the account could get.
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  timer = setInterval(() => {
    const current = activeClient
    if (current === undefined) return
    void tick(current).catch((err) => {
      console.error('[meetingReminders] tick failed', err)
    })
  }, TICK_MS)
})
