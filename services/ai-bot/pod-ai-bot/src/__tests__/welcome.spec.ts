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

import path from 'path'
import { loadWelcomeMessages, pickWelcome } from '../welcome'

const REPO_WELCOME = path.resolve(__dirname, '../../welcome.yaml')

describe('pickWelcome', () => {
  const messages = { en: 'hello', ru: 'привет', pt: 'olá' }

  it('takes the exact language', () => {
    expect(pickWelcome(messages, 'ru')).toBe('привет')
  })

  it('falls back to the base language before en', () => {
    expect(pickWelcome(messages, 'pt-br')).toBe('olá')
  })

  it('falls back to en for an unknown language', () => {
    expect(pickWelcome(messages, 'ja')).toBe('hello')
  })

  it('skips blank entries', () => {
    expect(pickWelcome({ en: 'hello', de: '   ' }, 'de')).toBe('hello')
  })

  it('returns undefined when even en is missing', () => {
    expect(pickWelcome({ de: 'hallo' }, 'ja')).toBeUndefined()
  })
})

describe('loadWelcomeMessages', () => {
  it('loads the repo welcome.yaml with en and ru', () => {
    const messages = loadWelcomeMessages(REPO_WELCOME)
    expect(messages.en).toContain('Yulia AI')
    expect(messages.ru).toContain('ЮляИИ')
  })

  it('returns empty for a missing file instead of throwing', () => {
    expect(loadWelcomeMessages('/nonexistent/welcome.yaml')).toEqual({})
  })
})
