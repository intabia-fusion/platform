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
import type { Contact } from '@hcengineering/contact'
import type { Ref } from '@hcengineering/core'

import { buildPersonNameMap, mergePersonSections, replacePersonRefs, stripTagsInProse } from '../llms/summarizeUtils'

const CLASS_URI = encodeURIComponent('contact:class:Contact')

function msg (personRef: string, personName: string): PersonMessage {
  return { personRef: personRef as Ref<Contact>, personName, time: 0, text: 'x' }
}

/** Median of `runs` timings, in milliseconds - less jumpy than a mean on a loaded CI box. */
function timeMs (runs: number, fn: () => void): number {
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = process.hrtime.bigint()
    fn()
    samples.push(Number(process.hrtime.bigint() - start) / 1e6)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

/**
 * Post-processing runs once per summary, on a few dozen lines, so the budgets below are generous by
 * orders of magnitude. They exist to catch a change that turns a linear pass into a quadratic one -
 * not to measure the machine.
 */
describe('summary post-processing performance', () => {
  it('handles a realistic summary in well under a millisecond', () => {
    const people = 8
    const messages = Array.from({ length: people }, (_, i) => msg(`p${i}`, `Фамилия${i} Имя${i}`))
    const map = buildPersonNameMap(messages)
    const summary = Array.from(
      { length: people },
      (_, i) => `**@Фамилия${i} Имя${i}**\n- первый пункт\n- второй пункт\n- третий пункт`
    ).join('\n\n')

    const ms = timeMs(21, () => {
      replacePersonRefs(stripTagsInProse(mergePersonSections(summary), map), map, CLASS_URI)
    })

    expect(ms).toBeLessThan(5)
  })

  // Every participant shares one name, so each gets a tag: the ambiguity and transliteration maps
  // are at their largest and every heading takes the fallback path.
  it('stays fast when every participant is a namesake', () => {
    const people = 100
    const messages = Array.from({ length: people }, (_, i) => msg(`p${i}`, 'Петров Иван'))
    const map = buildPersonNameMap(messages)
    const summary = Array.from(
      { length: people },
      (_, i) => `**@Петров Иван (${i + 1})**\n- Петров Иван (${i + 1}) сделал что-то\n- ещё пункт`
    ).join('\n\n')

    const ms = timeMs(11, () => {
      replacePersonRefs(stripTagsInProse(mergePersonSections(summary), map), map, CLASS_URI)
    })

    expect(ms).toBeLessThan(50)
  })

  // Transliteration is the fallback for a heading the model rewrote in another script; it runs per
  // roster name, never over the transcript.
  it('transliterates a large roster in a single pass per name', () => {
    const people = 200
    const messages = Array.from({ length: people }, (_, i) => msg(`p${i}`, `Фамилия${i} Имя${i} Отчество${i}`))
    const map = buildPersonNameMap(messages)

    const ms = timeMs(11, () => {
      // No heading matches, so every name is tried through the transliteration fallback.
      replacePersonRefs('**@Совершенно Другое Имя**\n- пункт', map, CLASS_URI)
    })

    expect(ms).toBeLessThan(25)
  })

  it('scales linearly, not quadratically, with the number of participants', () => {
    const build = (people: number): number => {
      const messages = Array.from({ length: people }, (_, i) => msg(`p${i}`, `Фамилия${i} Имя${i}`))
      const map = buildPersonNameMap(messages)
      const summary = Array.from({ length: people }, (_, i) => `**@Фамилия${i} Имя${i}**\n- пункт\n- пункт`).join(
        '\n\n'
      )
      return timeMs(11, () => {
        replacePersonRefs(stripTagsInProse(mergePersonSections(summary), map), map, CLASS_URI)
      })
    }

    const small = Math.max(build(25), 0.01)
    const large = build(200)

    // 8x the input: linear would be ~8x, quadratic ~64x. Generous bound, the point is the shape.
    expect(large / small).toBeLessThan(30)
  })
})
