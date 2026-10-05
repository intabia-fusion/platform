import { RecurringRule } from '..'
import { generateRecurringValues } from '../utils'

// Wall-clock time of a timestamp in the given zone, independent of process TZ.
function wall (ts: number, tz: string): string {
  return new Date(ts).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16)
}

// Node re-reads TZ on assignment, but only on the real process.env: Jest hands tests a copy.
const env: Record<string, string | undefined> = setTimeout.constructor('return process.env')()

describe.each(['UTC', 'America/Los_Angeles', 'Europe/Moscow', 'Asia/Bangkok'])('recurring values in %s', (tz) => {
  const saved = env.TZ

  beforeAll(() => {
    env.TZ = tz
  })

  afterAll(() => {
    if (saved === undefined) delete env.TZ
    else env.TZ = saved
  })

  function generate (rule: RecurringRule, start: Date, from: Date, to: Date): string[] {
    return generateRecurringValues(rule, start.getTime(), from.getTime(), to.getTime()).map((it) => wall(it, tz))
  }

  it.each(['01', '10', '23'])('monthly keeps day of month and %s:30 wall-clock across DST', (hour) => {
    const start = new Date(2024, 0, 15, Number(hour), 30)
    const result = generate({ freq: 'MONTHLY', interval: 1 }, start, new Date(2024, 0, 1), new Date(2024, 5, 30))
    expect(result).toEqual(['01', '02', '03', '04', '05', '06'].map((m) => `2024-${m}-15 ${hour}:30`))
  })

  it('monthly by month day skips months without that day', () => {
    const start = new Date(2024, 0, 31, 23, 0)
    const rule: RecurringRule = { freq: 'MONTHLY', interval: 1, byMonthDay: [31] }
    const result = generate(rule, start, new Date(2024, 0, 1), new Date(2024, 5, 30))
    expect(result).toEqual(['2024-01-31 23:00', '2024-03-31 23:00', '2024-05-31 23:00'])
  })

  it('monthly respects count', () => {
    const start = new Date(2024, 0, 15, 1, 0)
    const rule: RecurringRule = { freq: 'MONTHLY', interval: 2, count: 3 }
    const result = generate(rule, start, new Date(2024, 0, 1), new Date(2025, 0, 1))
    expect(result).toEqual(['2024-01-15 01:00', '2024-03-15 01:00', '2024-05-15 01:00'])
  })

  it.each(['01', '10', '23'])('monthly by setpos picks the first local Monday at %s:00', (hour) => {
    const start = new Date(2024, 0, 1, Number(hour), 0)
    const rule: RecurringRule = { freq: 'MONTHLY', interval: 1, byDay: ['MO'], bySetPos: [1] }
    const result = generate(rule, start, new Date(2024, 0, 1), new Date(2024, 5, 30))
    expect(result).toEqual(
      ['2024-01-01', '2024-02-05', '2024-03-04', '2024-04-01', '2024-05-06', '2024-06-03'].map((d) => `${d} ${hour}:00`)
    )
  })

  it.each(['01', '10', '23'])('yearly keeps date and %s:00 wall-clock across DST', (hour) => {
    // 2024-03-09 is before the US switch to DST, 2025-03-09 is the switch day, 2026-03-09 after it.
    const start = new Date(2024, 2, 9, Number(hour), 0)
    const result = generate({ freq: 'YEARLY', interval: 1 }, start, new Date(2024, 0, 1), new Date(2026, 11, 31))
    expect(result).toEqual([`2024-03-09 ${hour}:00`, `2025-03-09 ${hour}:00`, `2026-03-09 ${hour}:00`])
  })

  it('yearly by setpos picks the first local Sunday of January', () => {
    const start = new Date(2024, 0, 1, 1, 0)
    const rule: RecurringRule = { freq: 'YEARLY', interval: 1, byMonth: [0], byDay: ['SU'], bySetPos: [1] }
    const result = generate(rule, start, new Date(2024, 0, 1), new Date(2026, 11, 31))
    expect(result).toEqual(['2024-01-07 01:00', '2025-01-05 01:00', '2026-01-04 01:00'])
  })
})
