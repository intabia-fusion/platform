//
// Copyright © 2026 Intabia Fusion.
//

import type { AccountUuid } from '@hcengineering/core'
import type { DirectMessage } from '@hcengineering/chunter'
import type { PresenterControl } from '@hcengineering/server-activity'
import { ChannelTitlePresenter, DirectPropsPresenter, DirectTitlePresenter } from '../utils'

const persons = [
  { personUuid: 'a', name: 'Ann,Lee' },
  { personUuid: 'b', name: 'Bob,Smith' },
  { personUuid: 'c', name: 'Cat,Dow' }
]

// Answers the persons asked by `personUuid.$in`, as the storage does
const control = {
  ctx: {},
  findAll: jest.fn(async (_ctx, _class, query: any) =>
    persons.filter((it) => query.personUuid?.$in?.includes(it.personUuid) === true)
  )
} as unknown as PresenterControl

const direct = (data: Partial<DirectMessage>): DirectMessage =>
  ({ _id: 'dm:1', type: 'group', name: '', members: ['a', 'b'], ...data }) as unknown as DirectMessage

describe('DirectTitlePresenter', () => {
  it('names a direct by the other side for a viewer', async () => {
    const title = await DirectTitlePresenter(direct({ type: 'person' }), control, { account: 'a' as AccountUuid })
    expect(title).toContain('Bob')
    expect(title).not.toContain('Ann')
  })

  it('names a direct by everyone in it without a viewer', async () => {
    const title = await DirectTitlePresenter(direct({ type: 'person' }), control)
    expect(title).toContain('Ann')
    expect(title).toContain('Bob')
  })

  it('lists the names in the order of the members, not of the storage', async () => {
    const title = await DirectTitlePresenter(direct({ members: ['c', 'a', 'b'] as any }), control)
    expect(title).toMatch(/Cat.*Ann.*Bob/)
  })

  it('names a direct with oneself by oneself', async () => {
    const title = await DirectTitlePresenter(direct({ type: 'person', members: ['a'] as any }), control, {
      account: 'a' as AccountUuid
    })
    expect(title).toContain('Ann')
  })

  it('returns an empty name when the other person is gone', async () => {
    const title = await DirectTitlePresenter(direct({ members: ['a', 'x'] as any }), control, {
      account: 'a' as AccountUuid
    })
    expect(title).toBe('')
  })

  it('names a group of more than two by its name, for a viewer and without one', async () => {
    const team = direct({ name: 'Team', members: ['a', 'b', 'c'] as any })
    expect(await DirectTitlePresenter(team, control)).toBe('Team')
    expect(await DirectTitlePresenter(team, control, { account: 'a' as AccountUuid })).toBe('Team')
  })

  it('names a group of two by the members, as a rename writes both of them into its name', async () => {
    const pair = direct({ name: 'Ann, Bob' })
    const title = await DirectTitlePresenter(pair, control, { account: 'a' as AccountUuid })
    expect(title).toContain('Bob')
    expect(title).not.toContain('Ann')
  })

  it('takes a direct without members as one of no one', async () => {
    const bare = direct({ name: 'Team', members: undefined })
    expect(await DirectTitlePresenter(bare, control)).toBe('')
  })
})

describe('DirectPropsPresenter', () => {
  it('gives the client the members, the kind and the group name to build the title per viewer', async () => {
    const team = direct({ name: 'Team', members: ['a', 'b', 'c'] as any })
    expect(await DirectPropsPresenter(team, control)).toEqual({ members: ['a', 'b', 'c'], type: 'group', name: 'Team' })
  })
})

describe('ChannelTitlePresenter', () => {
  it('gives the bare name: a text that writes the hash adds it', async () => {
    expect(await ChannelTitlePresenter({ _id: 'ch:1', name: 'general' } as any, control)).toBe('general')
  })
})
