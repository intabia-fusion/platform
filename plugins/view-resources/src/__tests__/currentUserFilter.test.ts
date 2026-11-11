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

import core, {
  getCurrentAccount,
  setCurrentAccount,
  type Account,
  type Hierarchy,
  type TxOperations
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import { getCurrentEmployee } from '@hcengineering/contact'
import type { Filter } from '@hcengineering/view'
import { CURRENT_USER_FILTER_VALUE, isUserFilter } from '../currentUserFilter'
import { filtersToQuery, objectInResult, objectNinResult, parseFilters, serializeFilters } from '../filter'

jest.mock('@hcengineering/contact', () => ({
  __esModule: true,
  default: { class: { Person: 'Person' } },
  getCurrentEmployee: jest.fn()
}))
jest.mock('@hcengineering/presentation', () => ({ createQuery: jest.fn(), getClient: jest.fn() }))
jest.mock('@hcengineering/ui', () => ({ getCurrentResolvedLocation: jest.fn(), locationToUrl: jest.fn() }))
jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  getResource: jest.fn()
}))

const originalAccount = getCurrentAccount()
afterAll(() => {
  setCurrentAccount(originalAccount)
})

const marker = CURRENT_USER_FILTER_VALUE
function makeFilter (social: boolean, value: any[] = [marker]): Filter {
  return {
    key: {
      _class: 'Issue',
      key: social ? 'createdBy' : 'assignee',
      label: 'User',
      component: 'Selector',
      attribute: { type: social ? { _class: core.class.TypePersonId } : { _class: core.class.RefTo, to: 'Employee' } }
    },
    value,
    index: 1,
    mode: 'in',
    modes: ['in', 'nin']
  } as unknown as Filter
}
const hierarchy = {
  clone: (value: any) => structuredClone(value),
  isDerived: (clazz: string, base: string) => clazz === 'Employee' && base === 'Person',
  getAttribute: () => ({ attributeOf: 'Issue' }),
  isMixin: () => false
} as unknown as Hierarchy
const client = {
  getHierarchy: () => hierarchy,
  findOne: async (_class: any, query: any) => ({ result: query._id })
} as unknown as TxOperations

beforeEach(() => {
  jest.mocked(getResource).mockImplementation(async (id) => (id === 'nin' ? objectNinResult : objectInResult) as any)
})

it.each([false, true])(
  'resolves a saved condition for its reader, with inclusion and exclusion (social=%s)',
  async (social) => {
    const saved = serializeFilters([makeFilter(social, [marker, 'explicit'])])
    for (const user of ['alice', 'bob']) {
      setCurrentAccount({ uuid: user, socialIds: [`${user}-email`, `${user}-oidc`] } as unknown as Account)
      jest.mocked(getCurrentEmployee).mockReturnValue(`${user}-employee` as any)
      for (const mode of ['in', 'nin']) {
        const filters = parseFilters(saved)
        filters[0].mode = mode as any
        const expected = social ? [`${user}-email`, `${user}-oidc`, 'explicit'] : [`${user}-employee`, 'explicit']
        expect(await filtersToQuery(client, {}, filters, () => {})).toEqual({
          [social ? 'createdBy' : 'assignee']: { [mode === 'in' ? '$in' : '$nin']: expected }
        })
        expect(filters[0].value).toEqual([marker, 'explicit'])
      }
    }
  }
)

it('keeps ordinary values and deduplicates resolved identities', async () => {
  setCurrentAccount({ socialIds: ['email'] } as unknown as Account)
  expect(await filtersToQuery(client, {}, [makeFilter(true, [marker, 'email', null])], () => {})).toEqual({
    createdBy: { $in: ['email', null] }
  })
  expect(await filtersToQuery(client, {}, [makeFilter(false, ['other', null])], () => {})).toEqual({
    assignee: { $in: ['other', null] }
  })
})

it('does not offer a user marker for unrelated references or text fields', () => {
  const filter = makeFilter(false)
  ;(filter.key.attribute.type as any).to = 'Project'
  expect(isUserFilter(hierarchy, filter)).toBe(false)
  filter.key.attribute.type._class = core.class.TypeString
  expect(isUserFilter(hierarchy, filter)).toBe(false)
})
