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

// Must match the markers the elastic adapter emits. Control characters cannot be typed into a
// message, so message text can never forge one.
export const HIGHLIGHT_PRE = '\u0001'
export const HIGHLIGHT_POST = '\u0002'

export interface HighlightPart {
  text: string
  marked: boolean
}

/**
 * Splits a fragment into plain and marked runs.
 */
export function splitHighlight (fragment: string): HighlightPart[] {
  const parts: HighlightPart[] = []
  let rest = fragment

  while (rest.length > 0) {
    const start = rest.indexOf(HIGHLIGHT_PRE)
    if (start === -1) {
      parts.push({ text: rest, marked: false })
      break
    }
    if (start > 0) {
      parts.push({ text: rest.slice(0, start), marked: false })
    }
    const end = rest.indexOf(HIGHLIGHT_POST, start)
    if (end === -1) {
      parts.push({ text: rest.slice(start + 1), marked: true })
      break
    }
    parts.push({ text: rest.slice(start + 1, end), marked: true })
    rest = rest.slice(end + 1)
  }

  return parts.filter((p) => p.text !== '')
}

export function matchedTerms (fragments: string[]): string[] {
  const terms = new Set<string>()

  for (const fragment of fragments) {
    let rest = fragment
    while (rest.length > 0) {
      const start = rest.indexOf(HIGHLIGHT_PRE)
      if (start === -1) break
      const end = rest.indexOf(HIGHLIGHT_POST, start)
      if (end === -1) break
      const term = rest.slice(start + 1, end).trim()
      if (term !== '') terms.add(term)
      rest = rest.slice(end + 1)
    }
  }

  return Array.from(terms)
}
