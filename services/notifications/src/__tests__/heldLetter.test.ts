import type { AccountUuid } from '@hcengineering/core'
import { QueueTopic } from '@hcengineering/server-core'

import {
  cancelAccountLetters,
  cancelLetters,
  HELD_NOTIFICATIONS_TOPIC,
  heldLetterId,
  heldLetterPattern,
  scheduleLetter
} from '../heldLetter'
import { emptyResult } from '../utils/result'

const acc = 'acc-1' as AccountUuid

describe('held letters in the time machine', () => {
  it('fires back on the topic the service consumes', () => {
    expect(HELD_NOTIFICATIONS_TOPIC).toBe(QueueTopic.HeldNotifications)
  })

  it('schedules a letter under a key the cancel pattern of its notification matches', () => {
    const result = emptyResult()
    const held: any = { account: acc, notificationId: 'n-1', provider: 'email', message: { id: 'n-1' } }
    scheduleLetter(result, held, 3_600_000, 1_000)

    expect(result.timeMachine).toEqual([
      { type: 'schedule', id: 'letter:acc-1:n-1:email', targetDate: 3_601_000, topic: 'held-notifications', data: held }
    ])
    const pattern = heldLetterPattern(acc, 'n-1')
    expect(pattern).toBe('letter:acc-1:n-1:%')
    expect(new RegExp('^' + pattern.replace('%', '.*') + '$').test(heldLetterId(held))).toBe(true)
  })

  it('cancels every letter of the account with one prefix its letters match', () => {
    const result = emptyResult()
    cancelAccountLetters(result, acc)
    expect(result.timeMachine).toEqual([{ type: 'cancel', id: 'letter:acc-1:%' }])
    const held: any = { account: acc, notificationId: 'n-1', provider: 'email' }
    expect(heldLetterId(held).startsWith('letter:acc-1:')).toBe(true)
  })

  it('cancels one pattern per notification and nothing for an empty list', () => {
    const result = emptyResult()
    cancelLetters(result, acc, ['a', 'b'])
    cancelLetters(result, acc, [])
    expect(result.timeMachine).toEqual([
      { type: 'cancel', id: 'letter:acc-1:a:%' },
      { type: 'cancel', id: 'letter:acc-1:b:%' }
    ])
  })
})
