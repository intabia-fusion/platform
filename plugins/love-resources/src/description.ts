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

// The description of a calendar event is markup, not a line of text: a form field needs the text
// inside it and the calendar needs markup back. Kept free of UI imports so the writers of a meeting
// can use it from a plain unit test.

import { jsonToMarkup, markupToText, nodeDoc, nodeParagraph, nodeText } from '@hcengineering/text-core'

/** A markup document is a serialised node of type `doc`; anything else is plain text. */
function asMarkup (value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    const node = JSON.parse(trimmed)
    return node?.type === 'doc' ? trimmed : undefined
  } catch {
    return undefined
  }
}

/**
 * The text inside a markup description. Old records keep plain text in the same field, so anything
 * that fails to parse as markup is returned as it is.
 *
 * A build that put the markup itself into the text field left a description with markup inside its
 * text: such a value is unwrapped until it stops being a markup document, otherwise the form shows
 * the raw JSON and every save wraps it one level deeper.
 */
export function descriptionText (markup: string | undefined): string {
  if (markup === undefined || markup === '') return ''
  // Not a document: old records keep plain text in the same field, and a text that merely starts
  // with a brace must survive as it is.
  if (asMarkup(markup) === undefined) return markup
  let text = markupToText(markup)
  for (let i = 0; i < 5; i++) {
    const inner = asMarkup(text)
    if (inner === undefined) break
    const unwrapped = markupToText(inner)
    if (unwrapped === text) break
    text = unwrapped
  }
  return text
}

/** The reverse: the text a form field holds, as the markup document the calendar stores. */
export function descriptionMarkup (text: string): string {
  const value = text.trim()
  if (value === '') return ''
  // Already a document: wrapping it again would put the JSON into the text of a new one.
  if (asMarkup(value) !== undefined) return value
  return jsonToMarkup(nodeDoc(nodeParagraph(nodeText(value))))
}
