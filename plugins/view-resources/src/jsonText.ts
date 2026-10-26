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

const QUOTE = 34
const BACKSLASH = 92
const OPEN_OBJECT = 123
const CLOSE_OBJECT = 125
const OPEN_ARRAY = 91
const CLOSE_ARRAY = 93
const COMMA = 44
const COLON = 58

function isSpace (c: number): boolean {
  return c === 32 || c === 10 || c === 13 || c === 9
}

function isDelimiter (c: number): boolean {
  return c === COMMA || c === CLOSE_OBJECT || c === CLOSE_ARRAY || c === COLON || isSpace(c)
}

/**
 * Re-indents valid JSON text without parsing it into values: numbers past 2^53, key order and escapes stay as written.
 * Text that is not JSON comes back as is.
 */
export function indentJson (text: string, indent = '  '): string {
  try {
    JSON.parse(text)
  } catch {
    return text
  }

  // Whole slices for strings and numbers, appended to one string: per-character pushes took several times longer.
  let out = ''
  const pads: string[] = []
  const pad = (depth: number): string => (pads[depth] ??= '\n' + indent.repeat(depth))
  const n = text.length
  let depth = 0
  let i = 0
  while (i < n) {
    const c = text.charCodeAt(i)
    if (c === QUOTE) {
      let j = i + 1
      while (j < n && text.charCodeAt(j) !== QUOTE) j += text.charCodeAt(j) === BACKSLASH ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
      let j = i + 1
      while (isSpace(text.charCodeAt(j))) j++
      if (text.charCodeAt(j) === (c === OPEN_OBJECT ? CLOSE_OBJECT : CLOSE_ARRAY)) {
        out += c === OPEN_OBJECT ? '{}' : '[]'
        i = j + 1
      } else {
        out += text[i] + pad(++depth)
        i++
      }
    } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
      out += pad(--depth) + text[i]
      i++
    } else if (c === COMMA) {
      out += ',' + pad(depth)
      i++
    } else if (c === COLON) {
      out += ': '
      i++
    } else if (isSpace(c)) {
      i++
    } else {
      let j = i + 1
      while (j < n && !isDelimiter(text.charCodeAt(j))) j++
      out += text.slice(i, j)
      i = j
    }
  }
  return out
}
