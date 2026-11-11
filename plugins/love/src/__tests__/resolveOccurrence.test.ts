import { type Event, type ReccuringEvent } from '@hcengineering/calendar'
import { SCHEDULED_JOIN_LEAD_MS, SCHEDULED_MEETING_WINDOW_MS, meetingOccurrences, resolveOccurrence } from '../utils'

const hour = 60 * 60 * 1000
const day = 24 * hour
const start = new Date('2026-03-02T10:00:00Z').getTime()

function plain (date: number = start): Event {
  const res: Record<string, unknown> = { eventId: 'E1', date, dueDate: date + hour, allDay: false }
  return res as unknown as Event
}

function series (extra: Record<string, unknown> = {}): ReccuringEvent {
  const res: Record<string, unknown> = {
    ...(plain() as unknown as Record<string, unknown>),
    rules: [{ freq: 'DAILY', interval: 1 }],
    ...extra
  }
  return res as unknown as ReccuringEvent
}

describe('resolveOccurrence lookahead', () => {
  it('still finds the next occurrence of a yearly series', () => {
    // A flat 90-day window reported no `next`, and checkMeetingLink then expired a live link.
    const yearly = series({ rules: [{ freq: 'YEARLY', interval: 1 }] })
    const { current, next } = resolveOccurrence(yearly, start + 2 * day)
    expect(current).toBeUndefined()
    expect(next).toBeGreaterThan(start + 300 * day)
  })

  it('still finds the next occurrence of a half-yearly series', () => {
    const halfYearly = series({ rules: [{ freq: 'MONTHLY', interval: 6 }] })
    expect(resolveOccurrence(halfYearly, start + 2 * day).next).toBeGreaterThan(start + 100 * day)
  })
})

describe('meetingOccurrences', () => {
  it('returns the single start of a plain event inside the window', () => {
    expect(meetingOccurrences(plain(), start - day, start + day)).toEqual([start])
    expect(meetingOccurrences(plain(), start + hour, start + day)).toEqual([])
  })

  it('expands a daily series', () => {
    expect(meetingOccurrences(series(), start, start + 3 * day)).toEqual([start, start + day, start + 2 * day])
  })

  it('honours exdate and rdate', () => {
    const withHoles = series({ exdate: [start + day], rdate: [start + 12 * hour] })
    expect(meetingOccurrences(withHoles, start, start + 3 * day)).toEqual([start, start + 12 * hour, start + 2 * day])
  })

  it('treats an rdate-only event as recurring', () => {
    const sparse = series({ rules: undefined, rdate: [start + 5 * day] })
    expect(meetingOccurrences(sparse, start, start + 7 * day)).toEqual([start + 5 * day])
  })
})

describe('resolveOccurrence', () => {
  it('opens the window before the start', () => {
    const { current, next } = resolveOccurrence(plain(), start - SCHEDULED_JOIN_LEAD_MS)
    expect(current).toEqual(start)
    expect(next).toBeUndefined()
  })

  it('keeps the window open until it expires', () => {
    expect(resolveOccurrence(plain(), start + SCHEDULED_MEETING_WINDOW_MS - 1).current).toEqual(start)
    expect(resolveOccurrence(plain(), start + SCHEDULED_MEETING_WINDOW_MS).current).toBeUndefined()
  })

  it('points at the next occurrence when none is open', () => {
    // Too early for today's: the caller is told when to come back.
    const { current, next } = resolveOccurrence(series(), start - 2 * hour)
    expect(current).toBeUndefined()
    expect(next).toEqual(start)
  })

  it('prefers the occurrence in progress over the one that follows', () => {
    const { current, next } = resolveOccurrence(series(), start + hour)
    expect(current).toEqual(start)
    expect(next).toEqual(start + day)
  })

  it('reports neither once a finished plain event falls out of the window', () => {
    expect(resolveOccurrence(plain(), start + day)).toEqual({ current: undefined, next: undefined })
  })

  it('skips an excluded occurrence and offers the following one', () => {
    const withHole = series({ exdate: [start] })
    const { current, next } = resolveOccurrence(withHole, start)
    expect(current).toBeUndefined()
    expect(next).toEqual(start + day)
  })
})

describe('resolveOccurrence with calendar overrides', () => {
  it('does not open a meeting cancelled in the calendar', () => {
    // Calendar keeps a cancellation as a copy of the occurrence with `isCancelled`, not as exdate.
    const cancelled = [{ originalStartTime: start, date: start, isCancelled: true }]
    const { current, next } = resolveOccurrence(series(), start, cancelled)
    expect(current).toBeUndefined()
    expect(next).toEqual(start + day)
  })

  it('opens a meeting moved by a few hours at the new time', () => {
    const moved = [{ originalStartTime: start, date: start + 8 * hour }]
    // The old time is not an occurrence any more.
    expect(resolveOccurrence(series(), start, moved).current).toBeUndefined()
    // The new one is, once the join window reaches it.
    expect(resolveOccurrence(series(), start + 8 * hour, moved).current).toEqual(start + 8 * hour)
  })

  it('does not open today when the occurrence moved to tomorrow', () => {
    const moved = [{ originalStartTime: start, date: start + day }]
    const today = resolveOccurrence(series(), start, moved)
    expect(today.current).toBeUndefined()
    // Tomorrow is both the regular occurrence and the moved one: a single start, not two.
    expect(meetingOccurrences(series(), start, start + 3 * day, moved)).toEqual([start + day, start + 2 * day])
  })

  it('handles a cancellation and a move in the same series', () => {
    const overrides = [
      { originalStartTime: start, date: start, isCancelled: true },
      { originalStartTime: start + 2 * day, date: start + 2 * day + 3 * hour }
    ]
    expect(meetingOccurrences(series(), start, start + 3 * day, overrides)).toEqual([start + day, start + 2 * day + 3 * hour])
  })
})
