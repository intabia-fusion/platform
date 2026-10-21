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

import {
  getPasswordViolations,
  isPasswordValid,
  measurePassword,
  passwordRules,
  type PasswordValidations
} from '../password'

const normal: PasswordValidations = {
  MinLength: 8,
  MinSpecialChars: 1,
  MinDigits: 1,
  MinUpperChars: 1,
  MinLowerChars: 1
}

describe('measurePassword', () => {
  test('counts Latin letters, digits and special characters', () => {
    expect(measurePassword('Password1!')).toEqual({
      MinLength: 10,
      MinSpecialChars: 1,
      MinDigits: 1,
      MinUpperChars: 1,
      MinLowerChars: 7
    })
  })

  test('treats Cyrillic letters as letters, not as special characters', () => {
    expect(measurePassword('Пароль123')).toEqual({
      MinLength: 9,
      MinSpecialChars: 0,
      MinDigits: 3,
      MinUpperChars: 1,
      MinLowerChars: 5
    })
  })

  test('counts a non-Latin digit as a digit', () => {
    expect(measurePassword('٣').MinDigits).toBe(1)
  })

  test('counts characters, not UTF-16 units', () => {
    expect(measurePassword('a😀').MinLength).toBe(2)
  })

  test('counts punctuation and whitespace as special characters', () => {
    expect(measurePassword('a b!').MinSpecialChars).toBe(2)
  })
})

describe('getPasswordViolations', () => {
  test('reports every unsatisfied rule in the shared order', () => {
    expect(getPasswordViolations('12345678', normal)).toEqual([
      { rule: 'MinSpecialChars', count: 1 },
      { rule: 'MinUpperChars', count: 1 },
      { rule: 'MinLowerChars', count: 1 }
    ])
  })

  test('a Cyrillic password only misses a special character', () => {
    expect(getPasswordViolations('Пароль123', normal)).toEqual([{ rule: 'MinSpecialChars', count: 1 }])
    expect(getPasswordViolations('Пароль123!', normal)).toEqual([])
  })

  test('a Cyrillic password without an uppercase letter misses the uppercase rule', () => {
    expect(getPasswordViolations('пароль123!', normal)).toEqual([{ rule: 'MinUpperChars', count: 1 }])
  })

  test('an undefined policy accepts anything (none)', () => {
    expect(getPasswordViolations('1', undefined)).toEqual([])
    expect(isPasswordValid('1', undefined)).toBe(true)
  })

  test('the reported key order matches passwordRules', () => {
    const violations = getPasswordViolations('', normal)
    expect(violations.map((it) => it.rule)).toEqual(passwordRules)
  })
})

describe('isPasswordValid', () => {
  test('accepts a password that satisfies every rule', () => {
    expect(isPasswordValid('Пароль123!', normal)).toBe(true)
    expect(isPasswordValid('Password1!', normal)).toBe(true)
  })

  test('rejects a password that misses one rule', () => {
    expect(isPasswordValid('password1!', normal)).toBe(false)
  })
})
