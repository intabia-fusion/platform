//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { describe, it, expect } from 'vitest'
import {
  getPlatformColorByName,
  getPlatformAvatarColorByName,
  avatarWhiteColors,
  avatarDarkColors,
  resolvePaletteColor,
  getPaletteColorDef,
  whitePalette
} from '../colors'

describe('colors module tests', () => {
  describe('getPlatformColorByName', () => {
    it('get existing color, light theme', () => {
      const result = getPlatformColorByName('Firework', false)

      expect(result).toBeDefined()
      expect(result?.name).toBe('Firework')
      expect(result?.title).toBe('#C03B2F')
    })

    it('get existing color, dark theme', () => {
      const result = getPlatformColorByName('Firework', true)

      expect(result).toBeDefined()
      expect(result?.name).toBe('Firework')
      expect(result?.title).toBe('#FFFFFF')
    })

    it.each([
      { theme: 'light', darkTheme: false },
      { theme: 'dark', darkTheme: true }
    ])('get non-existent color ($theme theme)', ({ darkTheme }) => {
      const result = getPlatformColorByName('NonExistentColor', darkTheme)
      expect(result).toBeUndefined()
    })
  })

  describe('getPlatformAvatarColorByName', () => {
    it.each([
      { theme: 'light', darkTheme: false, expectedPalette: avatarWhiteColors },
      { theme: 'dark', darkTheme: true, expectedPalette: avatarDarkColors }
    ])('get non-existent color ($theme theme)', ({ darkTheme, expectedPalette }) => {
      const result = getPlatformAvatarColorByName('NonExistentAvatarColor', darkTheme)
      const firstColorFromPalette = expectedPalette[0]

      expect(result).toBeDefined()
      expect(result).toEqual(firstColorFromPalette)
    })
  })

  describe('resolvePaletteColor', () => {
    const green = 14
    const orange = 7

    it('takes the first color in priority order', () => {
      expect(resolvePaletteColor(orange, 3, green)).toBe(orange)
      expect(resolvePaletteColor(undefined, 3, green)).toBe(3)
      expect(resolvePaletteColor(undefined, undefined, green)).toBe(green)
    })

    // null used to reach getPlatformColorDef, which maps it to palette[0] (red)
    it('skips null colors', () => {
      expect(resolvePaletteColor(null, undefined, green)).toBe(green)
      expect(resolvePaletteColor(undefined, null, green)).toBe(green)
      expect(resolvePaletteColor(null, null, green)).toBe(green)
    })

    it('skips string colors (emoji and blob refs)', () => {
      expect(resolvePaletteColor('blob-ref', orange, green)).toBe(orange)
      expect(resolvePaletteColor('blob-ref', null, green)).toBe(green)
    })

    it('keeps 0 and array colors', () => {
      expect(resolvePaletteColor(0, orange, green)).toBe(0)
      expect(resolvePaletteColor([orange, 1], 3, green)).toEqual([orange, 1])
    })

    it('returns undefined when nothing usable is set', () => {
      expect(resolvePaletteColor(null, undefined, 'blob-ref')).toBeUndefined()
      expect(resolvePaletteColor()).toBeUndefined()
    })
  })

  describe('getPaletteColorDef', () => {
    it('returns the palette entry for an index', () => {
      expect(getPaletteColorDef(5, false)).toBe(whitePalette[5])
      expect(getPaletteColorDef([5, 1], false)).toBe(whitePalette[5])
    })

    it('returns undefined for null, undefined and strings', () => {
      expect(getPaletteColorDef(null, false)).toBeUndefined()
      expect(getPaletteColorDef(undefined, false)).toBeUndefined()
      expect(getPaletteColorDef('blob-ref', false)).toBeUndefined()
    })
  })
})
