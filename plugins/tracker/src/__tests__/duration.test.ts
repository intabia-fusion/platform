import { formatDuration, formatDurationCompact, formatDurationRoundedHours, isDurationRounded } from '../duration'

describe('duration formatting', () => {
  it('keeps durations up to four hours and rounds longer durations', () => {
    expect(formatDurationRoundedHours(0, 'ru')).toEqual('0ч')
    expect(formatDurationRoundedHours(30 / 60, 'ru')).toEqual('30м')
    expect(formatDurationRoundedHours(3.5, 'ru')).toEqual('3ч 30м')
    expect(formatDurationRoundedHours(4, 'ru')).toEqual('4ч')
    expect(formatDurationRoundedHours(4 + 1 / 60, 'ru')).toEqual('4ч')
    expect(formatDurationRoundedHours(4.5, 'ru')).toEqual('5ч')
    expect(formatDurationRoundedHours(5, 'ru')).toEqual('5ч')
    expect(formatDurationRoundedHours(17 + 29 / 60, 'ru')).toEqual('17ч')
    expect(formatDurationRoundedHours(17.5, 'ru')).toEqual('18ч')
    expect(formatDurationRoundedHours(17 + 45 / 60, 'ru')).toEqual('18ч')
    expect(formatDurationRoundedHours(17, 'en')).toEqual('17h')
    expect(formatDurationRoundedHours(17.5, 'ja')).toEqual('18時間')
    expect(formatDurationRoundedHours(-1, 'ru')).toEqual('')
    expect(formatDurationRoundedHours(Number.NaN, 'ru')).toEqual('')
  })

  it('normalizes floating-point sums to minutes before rounding or marking them', () => {
    const fourAndHalf = 69 / 60 + 179 / 60 + 22 / 60
    const fiveHours = 66 / 60 + 177 / 60 + 57 / 60
    expect(formatDurationRoundedHours(fourAndHalf, 'ru')).toBe('5ч')
    expect(isDurationRounded(fourAndHalf)).toBe(true)
    expect(formatDurationRoundedHours(fiveHours, 'ru')).toBe('5ч')
    expect(isDurationRounded(fiveHours)).toBe(false)
    expect(isDurationRounded(4 + 1 / 60)).toBe(true)
    expect(isDurationRounded(4)).toBe(false)
    expect(isDurationRounded(3.5)).toBe(false)
  })

  it('does not mark a floating-point sum that represents a whole hour', () => {
    expect(isDurationRounded(66 / 60 + 177 / 60 + 57 / 60)).toBe(false)
  })
  it('keeps every unit in the full form', () => {
    expect(formatDuration(18 * 5 * 8 + 3 * 8 + 5.5)).toEqual('749h 30m')
    expect(formatDuration(8 + 4)).toEqual('12h')
    expect(formatDuration(0)).toEqual('0h')
  })

  it('keeps the largest unit and the next one down', () => {
    expect(formatDurationCompact(18 * 5 * 8 + 3 * 8 + 5.5)).toEqual('18w 3d')
    expect(formatDurationCompact(1 * 5 * 8 + 4 * 8 + 7.5)).toEqual('1w 4d')
    expect(formatDurationCompact(8 + 4)).toEqual('1d 4h')
    expect(formatDurationCompact(2 + 20 / 60)).toEqual('2h 20m')
    expect(formatDurationCompact(2)).toEqual('2h')
    expect(formatDurationCompact(0.5)).toEqual('30m')
    expect(formatDurationCompact(0)).toEqual('0h')
  })

  it('drops the second unit when it is zero', () => {
    expect(formatDurationCompact(5 * 8 + 5)).toEqual('1w')
    expect(formatDurationCompact(8 + 20 / 60)).toEqual('1d')
  })
})
