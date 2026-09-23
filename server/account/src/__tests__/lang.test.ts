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

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { accountPlugin } from '../plugin'

const langDir = join(__dirname, '..', '..', 'lang')

function strings (file: string): Record<string, string> {
  return JSON.parse(readFileSync(join(langDir, file), 'utf8')).string
}

// A key missing from a locale falls back to English without any error, so nothing else catches it.
describe('account letters', () => {
  const ids = Object.keys(accountPlugin.string).sort()

  test.each(readdirSync(langDir).filter((f) => f.endsWith('.json')))('%s carries every string', (file) => {
    expect(Object.keys(strings(file)).sort()).toEqual(ids)
  })

  test.each(readdirSync(langDir).filter((f) => f.endsWith('.json')))('%s keeps the placeholders of en', (file) => {
    const placeholders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort()
    const en = strings('en.json')
    for (const [key, value] of Object.entries(strings(file))) {
      expect([key, placeholders(value)]).toEqual([key, placeholders(en[key] ?? '')])
    }
  })
})
