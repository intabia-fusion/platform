//
// Copyright © 2026 Intabia Fusion.
//

import type { AccountUuid } from '@hcengineering/core'
import type { DirectMessage } from '@hcengineering/chunter'
import type { PresenterControl } from '@hcengineering/server-activity'
import { DirectTitlePresenter } from '../utils'

describe('DirectTitlePresenter', () => {
  it('returns an empty name when the companion person is gone', async () => {
    const direct = { _id: 'dm:1', type: 'person', members: ['a', 'b'] } as unknown as DirectMessage
    const control = { ctx: {}, findAll: jest.fn(async () => []) } as unknown as PresenterControl

    expect(await DirectTitlePresenter(direct, control, { account: 'a' as AccountUuid })).toBe('')
  })
})
