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

process.env.ACCOUNTS_URL = 'http://account:3000'
process.env.SERVER_SECRET = 'secret'
process.env.FIRST_NAME = 'Julia'
process.env.LAST_NAME = 'AI'
process.env.STORAGE_CONFIG = 'minio'
process.env.CHUNK_STORAGE_CONFIG = 'minio'
/* eslint-disable @typescript-eslint/no-var-requires */
const { displayName } = require('../controller') as typeof import('../controller')
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * `Contact.name` is stored as "Last,First" (contact/src/utils.ts combineName). Sending that raw
 * form to the LLM is what made it rewrite "Ostapenko,Elena" as "Остапенко,Елена": the string does
 * not look like a name, so the model normalised it.
 */
describe('displayName', () => {
  it('renders the stored form the way the UI does', () => {
    expect(displayName({ name: 'Ostapenko,Elena' })).toBe('Ostapenko Elena')
    expect(displayName({ name: 'Петров,Иван' })).toBe('Петров Иван')
  })

  it('never leaks the separator', () => {
    for (const name of ['Ostapenko,Elena', 'Петров,Иван', '444,User4', 'AI,Julia']) {
      expect(displayName({ name })).not.toContain(',')
    }
  })

  it('keeps a name that has no separator, such as an organization', () => {
    expect(displayName({ name: 'Intabia Fusion' })).toBe('Intabia Fusion')
  })

  it('falls back to the part that exists when one half is empty', () => {
    expect(displayName({ name: 'Ostapenko,' })).toBe('Ostapenko')
    expect(displayName({ name: ',Elena' })).toBe('Elena')
  })

  it('handles a name that is only the separator', () => {
    expect(displayName({ name: ',' })).toBe(',')
  })
})
