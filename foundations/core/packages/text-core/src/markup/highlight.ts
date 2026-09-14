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

import { MarkupMarkType, MarkupNodeType, type MarkupNode } from './model'

// The engine highlights the plain text it indexed, and those offsets cannot address a position
// in a node tree - so the terms it matched are found again here, in the text nodes themselves.

const HIGHLIGHT_MARK = { type: MarkupMarkType.highlight }

const WORD_SPLIT = /[^\p{L}\p{N}]+/u
const WORD_CHAR = /[\p{L}\p{N}]/u

const MIN_TERM_LENGTH = 2

interface Span {
  start: number
  end: number
}

export function collectTerms (query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(WORD_SPLIT)
        .filter((t) => t.length >= MIN_TERM_LENGTH)
    )
  )
}

function findSpans (text: string, terms: string[]): Span[] {
  const lower = text.toLowerCase()
  const spans: Span[] = []

  for (const term of terms) {
    let from = 0
    while (from <= lower.length - term.length) {
      const at = lower.indexOf(term, from)
      if (at === -1) break
      from = at + term.length

      // Only at the start of a word: `lease` inside `release` is a coincidence.
      const before = at === 0 ? '' : lower[at - 1]
      if (before !== '' && WORD_CHAR.test(before)) continue

      // Exactly what matched, not the word around it: `plan` must not light up `planning` whole.
      spans.push({ start: at, end: at + term.length })
    }
  }

  if (spans.length === 0) return spans

  // Overlapping spans would otherwise split one run in two.
  spans.sort((a, b) => a.start - b.start)
  const merged: Span[] = [spans[0]]
  for (const span of spans.slice(1)) {
    const last = merged[merged.length - 1]
    if (span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
    } else {
      merged.push(span)
    }
  }
  return merged
}

function highlightTextNode (node: MarkupNode, terms: string[]): MarkupNode[] {
  const text = node.text ?? ''
  if (text === '') return [node]

  const spans = findSpans(text, terms)
  if (spans.length === 0) return [node]

  const out: MarkupNode[] = []
  let at = 0
  for (const span of spans) {
    if (span.start > at) {
      out.push({ ...node, text: text.slice(at, span.start) })
    }
    out.push({
      ...node,
      text: text.slice(span.start, span.end),
      marks: [...(node.marks ?? []), HIGHLIGHT_MARK]
    })
    at = span.end
  }
  if (at < text.length) {
    out.push({ ...node, text: text.slice(at) })
  }
  return out
}

function highlightNode (node: MarkupNode, terms: string[]): MarkupNode[] {
  if (node.type === MarkupNodeType.text) {
    return highlightTextNode(node, terms)
  }
  if (node.content === undefined) return [node]
  return [{ ...node, content: node.content.flatMap((child) => highlightNode(child, terms)) }]
}

/**
 * Returns a new document with every occurrence of `matched` marked; the input is not modified.
 *
 * `matched` are the words the search engine itself reported as hits. Nothing is derived from the
 * query text: the engine stems, tolerates typos and analyses per language, so only it knows what
 * actually matched - guessing alongside it would mark words the search never found.
 */
export function highlightMarkup (json: MarkupNode, matched: string[]): MarkupNode {
  const terms = collectTerms(matched.join(' '))
  if (terms.length === 0) return json
  return highlightNode(json, terms)[0]
}
