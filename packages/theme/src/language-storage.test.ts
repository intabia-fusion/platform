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

import { configureInterfaceLanguages, getCurrentLanguage, setDefaultLanguage } from './index'

jest.mock('svelte/store', () => ({ writable: jest.fn(), derived: jest.fn() }))
jest.mock('./Theme.svelte', () => ({}))
jest.mock('./InvertedTheme.svelte', () => ({}))
jest.mock('@hcengineering/analytics', () => ({ Analytics: { setTag: jest.fn() } }))

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

afterAll(() => {
  configureInterfaceLanguages()
  if (originalStorage !== undefined) {
    Object.defineProperty(globalThis, 'localStorage', originalStorage)
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

describe('persisted interface language', () => {
  beforeEach(() => {
    configureInterfaceLanguages('ru,en')
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    })
  })

  it('migrates a saved unsupported language and persists the fallback', () => {
    localStorage.setItem('lang', 'fr')
    expect(getCurrentLanguage()).toBe('en')
    expect(localStorage.getItem('lang')).toBe('en')
  })

  it.each(['ru', 'en'])('preserves a saved %s selection', (language) => {
    localStorage.setItem('lang', language)
    expect(getCurrentLanguage()).toBe(language)
    expect(localStorage.getItem('lang')).toBe(language)
  })

  it('applies the configured default to empty storage', () => {
    setDefaultLanguage('ru')
    expect(localStorage.getItem('lang')).toBe('ru')
    expect(getCurrentLanguage()).toBe('ru')
  })

  it.each([
    ['en,ru,fr', 'fr', 'fr'],
    ['ru', 'fr', 'ru'],
    ['fr', 'en', 'fr']
  ])('uses configured languages %s for saved %s', (languages, saved, expected) => {
    configureInterfaceLanguages(languages)
    localStorage.setItem('lang', saved)
    expect(getCurrentLanguage()).toBe(expected)
    expect(localStorage.getItem('lang')).toBe(expected)
  })

  it('parses the configured list and ignores unavailable locales', () => {
    expect(configureInterfaceLanguages(' en, ru,fr,fr,unknown, ')).toEqual(['en', 'ru', 'fr'])
    expect(configureInterfaceLanguages('unknown')).toEqual(['ru', 'en'])
    expect(configureInterfaceLanguages()).toEqual(['ru', 'en'])
  })

  it('does not overwrite a saved selection with the default', () => {
    localStorage.setItem('lang', 'en')
    setDefaultLanguage('ru')
    expect(getCurrentLanguage()).toBe('en')
    expect(localStorage.getItem('lang')).toBe('en')
  })
})
