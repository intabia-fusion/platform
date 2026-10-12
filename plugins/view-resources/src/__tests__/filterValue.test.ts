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

import type { Filter } from '@hcengineering/view'
import { valueInResult, valueNinResult } from '../filter'

jest.mock('@hcengineering/presentation', () => ({
  createQuery: jest.fn(),
  getClient: jest.fn()
}))

jest.mock('@hcengineering/ui', () => ({
  getCurrentResolvedLocation: jest.fn(),
  locationToUrl: jest.fn()
}))

function makeFilter (value: any[]): Filter {
  const filter: unknown = { value }
  return filter as Filter
}

describe('value filter modes', () => {
  it('does not apply an empty in/nin', async () => {
    expect(await valueInResult(makeFilter([]))).toEqual({})
    expect(await valueNinResult(makeFilter([]))).toEqual({})
  })

  it('flattens stored values', async () => {
    const filter = makeFilter([
      ['ABC', ['abc']],
      [1, [1]]
    ])
    expect(await valueInResult(filter)).toEqual({ $in: ['abc', 1] })
    expect(await valueNinResult(filter)).toEqual({ $nin: ['abc', 1] })
  })

  it('keeps null and empty strings of "Not selected"', async () => {
    const filter = makeFilter([[null, [null, '', '   ']]])
    expect(await valueInResult(filter)).toEqual({ $in: [null, '', '   '] })
    expect(await valueNinResult(filter)).toEqual({ $nin: [null, '', '   '] })
  })
})
