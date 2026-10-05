/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/
import { FirstWorkingDayAfter } from '../transform'

// Node re-reads TZ on assignment, but only on the real process.env: Jest hands tests a copy.
// Set per file: a globalSetup leaks TZ into every package of a shared jest run.
const env: Record<string, string | undefined> = setTimeout.constructor('return process.env')()

describe('FirstWorkingDayAfter', () => {
  const saved = env.TZ

  beforeAll(() => {
    env.TZ = 'America/Los_Angeles'
  })

  afterAll(() => {
    if (saved === undefined) delete env.TZ
    else env.TZ = saved
  })

  it('moves a UTC Sunday to the UTC Monday across a DST change in a non-UTC server timezone', () => {
    const sunday = Date.UTC(2024, 2, 10, 0, 30, 0)
    expect(new Date(FirstWorkingDayAfter(sunday)).toISOString()).toBe('2024-03-11T00:30:00.000Z')
  })
})
