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

import { orderSwimLanes } from '../swimLanes'

interface Lane {
  _id: string
  title: string
  value: unknown
}

const lane = (_id: string, title = ''): Lane => ({ _id, title, value: _id })
const byTitleOrId = (l: Lane): string => (l.title !== '' ? l.title : l._id)

describe('orderSwimLanes', () => {
  it('follows the sorted values and puts the rest after them by the fallback key', () => {
    const lanes = [lane('done'), lane('todo'), lane('zzz-orphan'), lane('in-progress'), lane('aaa-orphan')]
    const sorted = ['todo', 'in-progress', 'done']
    expect(orderSwimLanes(lanes, sorted, byTitleOrId).map((l) => l._id)).toEqual([
      'todo',
      'in-progress',
      'done',
      'aaa-orphan',
      'zzz-orphan'
    ])
  })

  it('uses only the fallback key when the field has no sort function', () => {
    const lanes = [lane('c-ref', 'Chat'), lane('a-ref', 'Web'), lane('b-ref', 'Api')]
    expect(orderSwimLanes(lanes, undefined, byTitleOrId).map((l) => l.title)).toEqual(['Api', 'Chat', 'Web'])
  })

  it('does not mutate the input', () => {
    const lanes = [lane('b'), lane('a')]
    orderSwimLanes(lanes, ['a', 'b'], byTitleOrId)
    expect(lanes.map((l) => l._id)).toEqual(['b', 'a'])
  })
})
