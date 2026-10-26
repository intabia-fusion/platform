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

import type { Doc, Ref } from '@hcengineering/core'

import { sortApplets } from '../applets'

const applet = (_id: string, createdOn?: number): Pick<Doc, '_id' | 'createdOn'> => ({ _id: _id as Ref<Doc>, createdOn })

describe('sortApplets', () => {
  it('orders by creation, the id deciding within one millisecond', () => {
    const sorted = sortApplets([applet('c', 2), applet('b', 1), applet('a', 2), applet('d')])
    expect(sorted.map((it) => it._id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('leaves the given list as it is', () => {
    const list = [applet('b', 2), applet('a', 1)]
    sortApplets(list)
    expect(list.map((it) => it._id)).toEqual(['b', 'a'])
  })
})
