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

import type { PersonMessage } from '@hcengineering/ai-bot'

/** Per-sender labels; namesakes get a `(1)`, `(2)` tag so the model can tell them apart. */
export function buildPersonNameMap (messages: PersonMessage[]): Map<string, string> {
  const personToName = new Map<string, string>()
  for (const m of messages) {
    if (!personToName.has(m.personRef)) {
      personToName.set(m.personRef, m.personName)
    }
  }

  const total = new Map<string, number>()
  for (const name of personToName.values()) {
    total.set(name, (total.get(name) ?? 0) + 1)
  }

  const seen = new Map<string, number>()
  for (const [personRef, name] of personToName) {
    if ((total.get(name) ?? 0) < 2) continue
    const idx = (seen.get(name) ?? 0) + 1
    seen.set(name, idx)
    personToName.set(personRef, `${name} (${idx})`)
  }

  return personToName
}

/**
 * One block per turn, in meeting order. Grouping by person instead made the model merge lines from
 * different moments into one invented fact; repeated headings are collapsed in `mergePersonSections`.
 */
export function buildMessageText (messages: PersonMessage[], personToName?: Map<string, string>): string {
  return messages.map((p) => `---\n\n@${personToName?.get(p.personRef) ?? p.personName}\n${p.text}`).join('\n\n')
}

/** The roster given to the model as the exhaustive list of real participants. */
export function buildParticipantList (personToName: Map<string, string>): string {
  return Array.from(personToName.values()).join(', ')
}

/** Percent-encode for a `[](...)` link; `encodeURIComponent` leaves parens, which end it early. */
function encodeUri (value: string): string {
  return encodeURIComponent(value).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/** The `(2)` tag `buildPersonNameMap` adds to namesakes, split off from the name itself. */
function splitTag (name: string): { base: string, tag?: string } {
  const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(name)
  return m === null ? { base: name } : { base: m[1], tag: m[2] }
}

/**
 * Comparison key: the model rewrites names ("Ostapenko,Elena" -> "Elena Ostapenko"), so match on the
 * sorted word set. The namesake tag stays part of the key.
 */
function nameKey (name: string): string {
  const { base, tag } = splitTag(name)
  const words = base
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((part) => part !== '')
    .sort()
    .join(' ')
  return tag === undefined ? words : `${words} (${tag})`
}

/**
 * Cyrillic -> Latin for the fallback match: the model transliterates names despite the prompt.
 * Multi-letter sequences come first so "щ"/"ш" do not collide.
 */
const CYRILLIC_TO_LATIN: Array<[RegExp, string]> = [
  [/щ/g, 'sh'],
  [/ш/g, 'sh'],
  [/ч/g, 'ch'],
  [/ц/g, 'c'],
  [/ю/g, 'u'],
  [/я/g, 'a'],
  [/ж/g, 'j'],
  [/х/g, 'h'],
  [/ё/g, 'e'],
  [/э/g, 'e'],
  [/[ъь]/g, ''],
  [/а/g, 'a'],
  [/б/g, 'b'],
  [/в/g, 'v'],
  [/г/g, 'g'],
  [/д/g, 'd'],
  [/е/g, 'e'],
  [/з/g, 'z'],
  [/и/g, 'i'],
  [/й/g, 'i'],
  [/к/g, 'k'],
  [/л/g, 'l'],
  [/м/g, 'm'],
  [/н/g, 'n'],
  [/о/g, 'o'],
  [/п/g, 'p'],
  [/р/g, 'r'],
  [/с/g, 's'],
  [/т/g, 't'],
  [/у/g, 'u'],
  [/ф/g, 'f'],
  [/ы/g, 'i']
]

/** Script-insensitive key, used only after an exact `nameKey` miss. */
function translitKey (name: string): string {
  let out = nameKey(name)
  for (const [from, to] of CYRILLIC_TO_LATIN) out = out.replace(from, to)
  return out.replace(/[yj]/g, 'i').replace(/(.)\1+/g, '$1')
}

/**
 * Drop the `(n)` tag from prose, where it reads as noise. The tag also identifies the person, so a
 * name the model got wrong ("Пётр (2)" for "Петров Иван") is replaced rather than just unmarked.
 * Anchored on the tag, not the name, since the model declines names; headings keep theirs.
 */
/** Whether a phrase is a form of the roster name; compares stems, since the model declines names. */
function namesOverlap (written: string, rosterName: string): boolean {
  const stems = (value: string): string[] =>
    value
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((word) => word.length > 2)
      .map((word) => word.slice(0, Math.max(3, word.length - 2)))
  const rosterStems = stems(rosterName)
  return stems(written).some((stem) => rosterStems.some((other) => stem.startsWith(other) || other.startsWith(stem)))
}

export function stripTagsInProse (text: string, personToName: Map<string, string>): string {
  const byTag = new Map<string, string>()
  for (const name of personToName.values()) {
    const { base, tag } = splitTag(name)
    if (tag !== undefined) byTag.set(tag, base)
  }
  if (byTag.size === 0) return text

  return text
    .split('\n')
    .map((line) => {
      if (/^\s*\*\*@.+\*\*\s*$/.test(line)) return line
      // Up to two words before the tag: enough for "Иван Петров" or a lone "Пётр".
      return line.replace(
        /((?:\p{L}[\p{L}-]*\s+)?\p{L}[\p{L}-]*)(\s*)\((\d+)\)/gu,
        (whole, phrase: string, _gap, tag: string) => {
          const full = byTag.get(tag)
          if (full === undefined) return whole
          // The written form is a declension of the real name: keep the model's wording, drop the tag.
          // Only a name it got wrong ("Пётр" for "Петров Иван") is replaced outright.
          return namesOverlap(phrase, full) ? phrase : full
        }
      )
    })
    .join('\n')
}

/**
 * Turn `**@Name**` headings into ref links, matched against the roster by `nameKey` (then by
 * `translitKey`, only on a unique hit). A heading that resolves to nobody, or an untagged namesake,
 * keeps its text without the `@`: a wrong link is worse than none.
 */
export function replacePersonRefs (text: string, personToName: Map<string, string>, classURI: string): string {
  const byKey = new Map<string, string>()
  const ambiguous = new Set<string>()
  const byTranslit = new Map<string, string[]>()
  for (const [personRef, name] of personToName) {
    byKey.set(nameKey(name), personRef)
    const { base, tag } = splitTag(name)
    if (tag !== undefined) ambiguous.add(nameKey(base))
    const tk = translitKey(name)
    byTranslit.set(tk, [...(byTranslit.get(tk) ?? []), personRef])
  }

  return text
    .split('\n')
    .map((line) => {
      const heading = /^(\s*)\*\*@(.+?)\*\*\s*$/.exec(line)
      if (heading === null) return line

      const [, indent, written] = heading
      const key = nameKey(written)
      let personRef = ambiguous.has(key) ? undefined : byKey.get(key)
      if (personRef === undefined && !ambiguous.has(key)) {
        // Fallback: the model transliterated the name. Only an unambiguous roster hit counts.
        const candidates = byTranslit.get(translitKey(written)) ?? []
        if (candidates.length === 1) personRef = candidates[0]
      }
      // Unknown or ambiguous heading: keep the text, only strip the @ that would render it as a mention.
      if (personRef === undefined) return `${indent}**${written.trim()}**`

      const label = personToName.get(personRef) ?? written.trim()
      const ref = `ref://?_class=${classURI}&_id=${encodeUri(personRef)}&label=${encodeUri(label)}`
      return `${indent}[](${ref})`
    })
    .join('\n')
    .trim()
}

/**
 * Fold repeated sections for one participant into their first one - the model opens a new section
 * each time a person speaks again, and no prompt wording stopped it. Runs before
 * `replacePersonRefs`, while headings are still `**@Name**`; the unheaded overview stays on top.
 */
export function mergePersonSections (text: string): string {
  const preamble: string[] = []
  const order: string[] = []
  const sections = new Map<string, { heading: string, body: string[] }>()
  let current: string | undefined

  for (const line of text.split('\n')) {
    const heading = /^\s*\*\*@(.+?)\*\*\s*$/.exec(line)
    if (heading !== null) {
      const key = heading[1].trim().toLowerCase()
      current = key
      if (!sections.has(key)) {
        sections.set(key, { heading: line, body: [] })
        order.push(key)
      }
      continue
    }
    if (current === undefined) {
      preamble.push(line)
    } else {
      sections.get(current)?.body.push(line)
    }
  }

  if (order.length === 0) return text

  const trimEnds = (lines: string[]): string[] => {
    let start = 0
    let end = lines.length
    while (start < end && lines[start].trim() === '') start++
    while (end > start && lines[end - 1].trim() === '') end--
    return lines.slice(start, end)
  }

  const blocks = order.map((key) => {
    const section = sections.get(key)
    if (section === undefined) return ''
    // Blank lines inside a section came from the gaps between the pieces being merged; dropping
    // them keeps the bullets one list instead of several.
    const body = trimEnds(section.body).filter((line) => line.trim() !== '')
    return [section.heading, ...body].join('\n')
  })

  const head = trimEnds(preamble)
  return [...(head.length > 0 ? [head.join('\n')] : []), ...blocks].join('\n\n')
}
