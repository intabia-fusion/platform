//
// Copyright © 2026 Intabia Fusion.
//

import { Doc, Hierarchy } from '@hcengineering/core'
import { TriggerControl } from '@hcengineering/server-core'
import resources from '..'

describe('LinkIdProvider', () => {
  it('encodes with the (doc, control) signature of ServerLinkIdProvider', async () => {
    const hierarchy = { getClass: () => ({ shortLabel: 'APP' }) } as unknown as Hierarchy
    const control = { hierarchy } as unknown as TriggerControl
    const { function: fns } = await resources()

    const id = await (fns.LinkIdProvider as any)(
      { _class: 'recruit:class:Applicant', number: 7 } as unknown as Doc,
      control
    )

    expect(id).toBe('APP-7')
  })
})
