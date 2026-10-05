//
// Copyright © 2026 Intabia Fusion.
//

import type { Doc } from '@hcengineering/core'
import type { PresenterControl } from '@hcengineering/server-activity'
import resources from '..'

const event = { _id: 'event:1', attachedTo: 'target:1', attachedToClass: 'some:class:Target' } as unknown as Doc
const control = { ctx: {}, findAll: jest.fn(async () => []) } as unknown as PresenterControl

describe('reminder presenters', () => {
  it.each(['ReminderUrlPresenter', 'ReminderIdentifierPresenter'])(
    '%s returns undefined when the reminder target is gone',
    async (name) => {
      const { function: fns } = await resources()
      expect(await (fns as any)[name](event, control)).toBeUndefined()
    }
  )
})
