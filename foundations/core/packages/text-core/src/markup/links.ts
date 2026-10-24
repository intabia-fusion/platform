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

import { MarkupMarkType, MarkupNode, MarkupNodeType } from './model'
import { traverseNode } from './traverse'

const BARE_URL = /\bhttps?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION = new Set('.,;:!?)]}»"\'’')
// Signs around an address that say nothing on their own: "(https://…)", "— https://…".
const PUNCTUATION = new Set('.,;:!?()[]{}«»"\'‘’“”-–—')
// What a reader sees besides text: a mention, an emoji, a picture.
const CONTENT_NODES = new Set<string>([
  MarkupNodeType.reference,
  MarkupNodeType.emoji,
  MarkupNodeType.image,
  MarkupNodeType.file,
  MarkupNodeType.mermaid,
  MarkupNodeType.embed
])

/**
 * @public
 */
export interface MarkupLink {
  url: string
  host: string
}

function parseLink (value: string): MarkupLink | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    const host = writtenHost(value) ?? url.hostname.toLowerCase()
    return { url: url.toString(), host: host.startsWith('www.') ? host.slice(4) : host }
  } catch {
    return undefined
  }
}

// As typed: the parsed host is punycode, `xn--j1ail.xn--p1ai` for `кто.рф`.
function writtenHost (value: string): string | undefined {
  const start = value.indexOf('://')
  if (start < 0) return undefined
  let host = value.slice(start + 3)
  for (const stop of ['/', '?', '#']) {
    const end = host.indexOf(stop)
    if (end >= 0) host = host.slice(0, end)
  }
  host = host.slice(host.lastIndexOf('@') + 1)
  const port = host.lastIndexOf(':')
  if (port >= 0 && !host.endsWith(']')) host = host.slice(0, port)
  return host === '' ? undefined : host.toLowerCase()
}

function count (value: string, char: string): number {
  let result = 0
  for (const it of value) if (it === char) result++
  return result
}

// A scan, not a regex: an anchored character class backtracks on every start of a long punctuation run.
function trimBareUrl (value: string): string {
  let end = value.length
  while (end > 0 && TRAILING_PUNCTUATION.has(value[end - 1])) end--
  const trimmed = value.slice(0, end)
  // A closing bracket belongs to the url when it opened one inside, as in wiki links.
  return value[end] === ')' && count(trimmed, '(') > count(trimmed, ')') ? trimmed + ')' : trimmed
}

/**
 * @public
 */
export function extractLinks (content: MarkupNode, limit: number = Infinity): MarkupLink[] {
  const result: MarkupLink[] = []
  const seen = new Set<string>()

  const add = (value: string | undefined): void => {
    if (value == null || value === '') return
    const link = parseLink(value)
    if (link == null || seen.has(link.url)) return
    seen.add(link.url)
    result.push(link)
  }

  traverseNode(content, (node) => {
    if (result.length >= limit) return false
    // A url in code is part of a command or a log, not a link someone shared.
    if (node.type === MarkupNodeType.code_block) return false
    if (node.type !== MarkupNodeType.text) return true

    const mark = node.marks?.find((m) => m.type === MarkupMarkType.link)
    if (mark !== undefined) {
      add(mark.attrs?.href)
      return false
    }
    if (node.marks?.some((m) => m.type === MarkupMarkType.code) === true) return false

    for (const match of (node.text ?? '').matchAll(BARE_URL)) {
      if (result.length >= limit) break
      add(trimBareUrl(match[0]))
    }
    return false
  })

  return result
}

// Without the scheme, `www.` and a closing slash: the editor links a typed `example.com` to `http://example.com`.
function bareAddress (value: string): string {
  let result = value.trim().toLowerCase()
  for (const scheme of ['https://', 'http://']) {
    if (result.startsWith(scheme)) result = result.slice(scheme.length)
  }
  if (result.startsWith('www.')) result = result.slice(4)
  while (result.endsWith('/')) result = result.slice(0, -1)
  return result
}

function isAddress (text: string, href: unknown): boolean {
  const value = text.trim()
  if (typeof href === 'string' && bareAddress(value) === bareAddress(href)) return true
  const lower = value.toLowerCase()
  return (lower.startsWith('http://') || lower.startsWith('https://')) && !value.includes(' ')
}

function hasWords (text: string): boolean {
  return Array.from(text).some((ch) => ch.trim() !== '' && !PUNCTUATION.has(ch))
}

/**
 * Whether the text holds nothing but addresses: a message that only shares a link.
 * @public
 */
export function hasOnlyLinks (content: MarkupNode): boolean {
  let words = false
  traverseNode(content, (node) => {
    if (words) return false
    if (CONTENT_NODES.has(node.type)) {
      words = true
      return false
    }
    // A url in code is not a link, as `extractLinks` has it: it is a word like the rest of the code.
    if (node.type === MarkupNodeType.code_block) {
      words = (node.content ?? []).some((it) => (it.text ?? '').trim() !== '')
      return false
    }
    if (node.type !== MarkupNodeType.text) return true
    const text = node.text ?? ''
    if (node.marks?.some((m) => m.type === MarkupMarkType.code) === true) {
      words = text.trim() !== ''
      return false
    }
    const link = node.marks?.find((m) => m.type === MarkupMarkType.link)
    const rest = link !== undefined ? (isAddress(text, link.attrs?.href) ? '' : text) : text.replace(BARE_URL, '')
    words = hasWords(rest)
    return false
  })
  return !words
}
