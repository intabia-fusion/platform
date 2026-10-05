//
// Copyright © 2026 Intabia Fusion.
//

import type { Doc } from '@hcengineering/core'
import type { PresenterControl } from '@hcengineering/server-activity'
import resources from '..'

describe('RequestTitlePresenter', () => {
  it('returns an empty title when the request employee is gone', async () => {
    const request = { _id: 'request:1', attachedTo: 'employee:1', type: 'hr:type:Vacation' } as unknown as Doc
    const control = { ctx: {}, findAll: jest.fn(async () => []) } as unknown as PresenterControl
    const { function: fns } = await resources()

    expect(await (fns as any).RequestTitlePresenter(request, control)).toBe('')
  })
})
