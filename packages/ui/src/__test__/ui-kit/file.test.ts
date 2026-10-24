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

import { describe, expect, it } from 'vitest'

import { computePeaks } from '../../ui-kit/audio/peaks'
import { formatFileSize, formatMediaDuration as formatDuration } from '../../ui-kit/file/format'

describe('formatDuration', () => {
  it.each([
    [5, '0:05'],
    [69.4, '1:09'],
    [3725, '1:02:05']
  ])('%s -> %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })

  it('is undefined for an unknown length', () => {
    expect(formatDuration(undefined)).toBeUndefined()
    expect(formatDuration(Infinity)).toBeUndefined()
    expect(formatDuration(0)).toBeUndefined()
  })
})

describe('formatFileSize', () => {
  it('picks the unit and keeps one decimal below a hundred', () => {
    expect(formatFileSize(512, 'en')).toBe('512 B')
    expect(formatFileSize(28, 'fr')).toBe('28 o')
    expect(formatFileSize(28, 'ru')).toBe('28 Б')
    expect(formatFileSize(366.1 * 1024, 'en')).toBe('366 kB')
    expect(formatFileSize(5.24 * 1024 * 1024, 'en')).toBe('5.2 MB')
  })

  it('takes the next unit for a size that rounds up to 1024', () => {
    expect(formatFileSize(1023, 'en')).toBe('1,023 B')
    expect(formatFileSize(1023.6 * 1024, 'en')).toBe('1 MB')
    expect(formatFileSize(1023.4 * 1024, 'en')).toBe('1,023 kB')
  })
})

describe('computePeaks', () => {
  it('scales the loudest bar to full height and keeps silence visible', () => {
    const data = new Float32Array([0, 0, 0, 0, 0.5, -0.5, 0.5, -0.5, 0.25, -0.25, 0.25, -0.25])
    expect(computePeaks(data, 3)).toEqual([0.1, 1, 0.5])
  })

  it('returns flat bars for silence and short input', () => {
    expect(computePeaks(new Float32Array(4), 2)).toEqual([0.1, 0.1])
    expect(computePeaks(new Float32Array([0.3]), 3)).toEqual([1, 0.1, 0.1])
  })
})
