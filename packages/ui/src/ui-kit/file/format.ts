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

export function formatMediaDuration (seconds: number | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return undefined
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = `${total % 60}`.padStart(2, '0')
  return h > 0 ? `${h}:${`${m}`.padStart(2, '0')}:${s}` : `${m}:${s}`
}

const sizeFormats = new Map<string, Intl.NumberFormat>()
const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte']

export function formatFileSize (bytes: number, lang: string): string {
  let value = Math.max(bytes, 0)
  let unit = 0
  // From 1023.5 up: rounded, it would read "1,024 kB" instead of "1 MB".
  while (value >= 1023.5 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  const key = `${lang}|${unit}|${digits}`
  let format = sizeFormats.get(key)
  if (format == null) {
    // Building a formatter is costly next to using one, and a list of files asks for a few dozen sizes.
    format = new Intl.NumberFormat(lang, {
      style: 'unit',
      unit: SIZE_UNITS[unit],
      unitDisplay: unit === 0 ? 'narrow' : 'short',
      maximumFractionDigits: digits
    })
    sizeFormats.set(key, format)
  }
  if (unit > 0) return format.format(value)
  // Narrow bytes run into the number in some languages ("28B"), while "3.5 kB" is spaced.
  const parts = format.formatToParts(value)
  return parts
    .map((it, i) => (it.type === 'unit' && parts[i - 1]?.type === 'integer' ? ` ${it.value}` : it.value))
    .join('')
}
