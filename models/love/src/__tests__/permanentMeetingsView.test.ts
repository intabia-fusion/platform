//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
import type { Builder } from '@hcengineering/model'
import { SortingOrder } from '@hcengineering/core'

import { createModel } from '..'
import love from '../plugin'

interface Recorded {
  _class: string
  attributes: Record<string, any>
  id: string
}

// The view settings offer a key only when the viewlet names it in `viewOptions`: an empty `groupBy`
// or a single `orderBy` entry left the dropdowns with nothing to pick (QA-2).
function recordedViewlets (): Recorded[] {
  const docs: Recorded[] = []
  const builder = {
    createDoc: (_class: string, _space: string, attributes: Record<string, any>, id: string) => {
      docs.push({ _class: _class as unknown as string, attributes, id: id as unknown as string })
      return id
    },
    mixin: () => {},
    createModel: () => {},
    // `createAttributePresenter` asks the hierarchy for the attribute it registers a presenter for.
    hierarchy: { getAttribute: (_class: string, key: string) => ({ _id: `${_class}:${key}` }) }
  } as unknown as Builder
  createModel(builder)
  return docs
}

describe('permanent meetings view settings', () => {
  const viewlets = recordedViewlets()

  const viewlet = (id: string): Recorded => {
    const found = viewlets.find((it) => it.id === id)
    if (found === undefined) throw new Error(`viewlet ${id} is not created`)
    return found
  }

  const groupingKeys = (id: string): string[] =>
    (viewlet(id).attributes.viewOptions.groupBy as Array<string | { key: string }>).map((it) =>
      typeof it === 'string' ? it : it.key
    )

  const orderingKeys = (id: string): string[] =>
    (viewlet(id).attributes.viewOptions.orderBy as Array<[string, SortingOrder]>).map((it) => it[0])

  it.each([
    ['table', love.viewlet.TablePermanentMeetings],
    ['list', love.viewlet.ListPermanentMeetings]
  ])('groups the %s view by group, members and visibility', (_kind, id) => {
    expect(groupingKeys(id as unknown as string)).toEqual(expect.arrayContaining(['group', 'members', 'private']))
  })

  it.each([
    ['table', love.viewlet.TablePermanentMeetings],
    ['list', love.viewlet.ListPermanentMeetings]
  ])('sorts the %s view by name, creation and change date', (_kind, id) => {
    expect(orderingKeys(id as unknown as string)).toEqual(expect.arrayContaining(['name', 'createdOn', 'modifiedOn']))
  })

  it('opens the list grouped by the meeting group', () => {
    expect(groupingKeys(love.viewlet.ListPermanentMeetings as unknown as string)[0]).toBe('group')
  })
})
