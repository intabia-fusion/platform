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

import platform, { addStringsLoader, platformId, translate } from '@hcengineering/platform'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const langDir = join(__dirname, '..', '..', '..', '..', 'foundations', 'core', 'packages', 'platform', 'lang')
const locales = readdirSync(langDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))

// A key missing from a locale falls back to English silently, so nothing else catches it.
describe('platform status texts the account answers with', () => {
  beforeAll(() => {
    addStringsLoader(platformId, async (lang) => JSON.parse(readFileSync(join(langDir, `${lang}.json`), 'utf8')))
  })

  test.each(locales)('TooManyOtpAttempts is in %s and reads for every count of minutes', async (locale) => {
    expect(typeof JSON.parse(readFileSync(join(langDir, `${locale}.json`), 'utf8')).status.TooManyOtpAttempts).toBe(
      'string'
    )

    for (const minutes of [1, 2, 5, 21, 60]) {
      const text = await translate(platform.status.TooManyOtpAttempts, { retryOn: 0, minutes }, locale, true)

      expect(text).not.toBe(platform.status.TooManyOtpAttempts)
      expect(text).toContain(String(minutes))
    }
  })
})
