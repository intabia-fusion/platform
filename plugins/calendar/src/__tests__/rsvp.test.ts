import { type PersonId, type Ref } from '@hcengineering/core'
import { type Contact } from '@hcengineering/contact'
import { AccessLevel } from '..'
import { collectRsvp, collectRsvpAnswers, rsvpPending } from '../utils'

const alice = 'alice' as PersonId
const bob = 'bob' as PersonId
const carol = 'carol' as PersonId

// Shaped like a real copy (`{ ...master, calendar, access, user }`): `participants` is the
// master's list, identical everywhere, and only `user` tells two copies apart.
const participants = ['alice-person', 'bob-person', 'carol-person'] as Array<Ref<Contact>>

function copy (who: PersonId, rsvp?: string): any {
  return { access: AccessLevel.Reader, participants, user: who, rsvp }
}

describe('collectRsvp', () => {
  it('counts nothing when nobody answered', () => {
    expect(collectRsvp([])).toEqual({ accepted: 0, declined: 0, tentative: 0 })
  })

  it('splits the answers it has', () => {
    const copies = [copy(alice, 'accepted'), copy(bob, 'declined'), copy(carol, 'tentative')]
    expect(collectRsvp(copies)).toEqual({ accepted: 1, declined: 1, tentative: 1 })
  })

  it('skips a copy without an answer', () => {
    expect(collectRsvp([copy(alice, 'accepted'), copy(bob)])).toMatchObject({ accepted: 1, declined: 0 })
  })

  it('ignores the master row', () => {
    // The organiser's own document is not an answer, and counting it would invent one.
    const master = { access: AccessLevel.Owner, participants, user: alice, rsvp: 'accepted' } as any
    expect(collectRsvp([master])).toEqual({ accepted: 0, declined: 0, tentative: 0 })
  })

  it('keeps one answer per person when copies duplicate', () => {
    expect(collectRsvp([copy(alice, 'declined'), copy(alice, 'accepted')])).toMatchObject({
      accepted: 1,
      declined: 0
    })
  })
})

describe('collectRsvpAnswers', () => {
  it('names the answer behind every count', () => {
    const copies = [copy(carol, 'tentative'), copy(alice, 'accepted'), copy(bob, 'declined')]
    expect(collectRsvpAnswers(copies)).toEqual([
      // Sorted by social id, so two passes over the same answers compare equal.
      { user: alice, status: 'accepted' },
      { user: bob, status: 'declined' },
      { user: carol, status: 'tentative' }
    ])
  })

  it('agrees with the counts of the same copies', () => {
    const copies = [copy(alice, 'accepted'), copy(bob), copy(carol, 'accepted')]
    const answers = collectRsvpAnswers(copies)
    const summary = collectRsvp(copies)
    expect(answers).toHaveLength(summary.accepted + summary.declined + summary.tentative)
    expect(answers.filter((it) => it.status === 'accepted')).toHaveLength(summary.accepted)
  })

  it('ignores the master row and copies without an answer', () => {
    const master = { access: AccessLevel.Owner, participants, user: alice, rsvp: 'accepted' } as any
    expect(collectRsvpAnswers([master, copy(bob)])).toEqual([])
  })

  it('keeps the last answer of one person', () => {
    expect(collectRsvpAnswers([copy(alice, 'declined'), copy(alice, 'accepted')])).toEqual([
      { user: alice, status: 'accepted' }
    ])
  })
})

describe('rsvpPending', () => {
  it('treats silence as pending, not as a refusal', () => {
    expect(rsvpPending(3, { accepted: 1, declined: 0, tentative: 0 })).toBe(2)
  })

  it('counts everyone pending before the first answer', () => {
    expect(rsvpPending(3, undefined)).toBe(3)
  })

  it('never goes negative when more answered than are invited', () => {
    // Someone dropped from the event keeps their copy until the trigger removes it.
    expect(rsvpPending(1, { accepted: 2, declined: 0, tentative: 0 })).toBe(0)
  })
})
