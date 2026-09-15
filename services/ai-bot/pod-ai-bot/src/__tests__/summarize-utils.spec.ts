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

import {
  buildMessageText,
  buildParticipantList,
  buildPersonNameMap,
  mergePersonSections,
  replacePersonRefs,
  stripTagsInProse
} from '../llms/summarizeUtils'

const CLASS_URI = encodeURIComponent('contact:class:Contact')

function msg (personRef: string, personName: string, text: string, time = 0): PersonMessage {
  return { personRef: personRef as Ref<Contact>, personName, time, text }
}

/** The names the LLM was actually shown, i.e. every `@Name` header in the user message. */
function namesInText (text: string): string[] {
  return [...text.matchAll(/^@(.+)$/gm)].map((m) => m[1])
}

describe('buildPersonNameMap', () => {
  it('maps each person to their display name', () => {
    const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a'), msg('p2', 'Анна Смирнова', 'b')])
    expect(map.get('p1')).toBe('Максим Денисов')
    expect(map.get('p2')).toBe('Анна Смирнова')
  })

  it('keeps the first name for repeated messages of one person', () => {
    const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a'), msg('p1', 'Максим Денисов', 'b')])
    expect(map.size).toBe(1)
  })

  it('tags namesakes so they can be told apart', () => {
    const map = buildPersonNameMap([msg('p1', 'Иван Петров', 'a'), msg('p2', 'Иван Петров', 'b')])
    expect(map.get('p1')).toBe('Иван Петров (1)')
    expect(map.get('p2')).toBe('Иван Петров (2)')
  })
})

describe('buildMessageText', () => {
  it('labels every message with its author', () => {
    const text = buildMessageText([msg('p1', 'Максим Денисов', 'Коллеги, всем привет.')])
    expect(text).toContain('@Максим Денисов')
    expect(text).toContain('Коллеги, всем привет.')
  })

  // The map exists to tell namesakes apart; if the text keeps the bare name the LLM cannot see
  // the distinction and replacePersonRefs later looks for a label that was never shown.
  it('carries the disambiguated names into the text the LLM sees', () => {
    const messages = [msg('p1', 'Иван Петров', 'первый'), msg('p2', 'Иван Петров', 'второй')]
    const map = buildPersonNameMap(messages)

    expect(new Set(namesInText(buildMessageText(messages, map)))).toEqual(new Set(map.values()))
  })
})

describe('replacePersonRefs', () => {
  it('turns a bolded known participant into a ref link', () => {
    const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a')])
    const out = replacePersonRefs('**@Максим Денисов**\n- план на месяц', map, CLASS_URI)

    expect(out).toContain(`ref://?_class=${CLASS_URI}&_id=p1&label=`)
    expect(out).not.toContain('**@Максим Денисов**')
  })

  it('resolves a disambiguated namesake to the right person', () => {
    const map = buildPersonNameMap([msg('p1', 'Иван Петров', 'a'), msg('p2', 'Иван Петров', 'b')])
    const out = replacePersonRefs('**@Иван Петров (2)**', map, CLASS_URI)

    expect(out).toContain('_id=p2')
  })

  // A hallucinated name has no ref to resolve to, so it must not survive as a participant heading.
  it('does not leave an unknown participant as a heading', () => {
    const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a')])
    const out = replacePersonRefs('**@Максим Денисов**\n**@Петров_Алексей**\n- поддержал идею', map, CLASS_URI)

    expect(out).not.toContain('**@Петров_Алексей**')
  })
})

describe('buildParticipantList', () => {
  it('lists every participant once', () => {
    const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a'), msg('p2', 'Анна Смирнова', 'b')])
    expect(buildParticipantList(map)).toBe('Максим Денисов, Анна Смирнова')
  })

  it('lists the tagged names, the ones the model is shown', () => {
    const map = buildPersonNameMap([msg('p1', 'Иван Петров', 'a'), msg('p2', 'Иван Петров', 'b')])
    expect(buildParticipantList(map)).toBe('Иван Петров (1), Иван Петров (2)')
  })
})

/**
 * FUSIO (reported 2026-04-17): one speaker, one sentence, and the summary invented
 * "Участник_Без_Имени" and "Петров_Алексей" with opinions of their own.
 */
describe('single-speaker meeting (hallucinated participants)', () => {
  const messages = [
    msg('maxim', 'Максим Денисов', 'Коллеги, всем привет. Давайте сформируем план работы на следующий месяц.')
  ]

  const hallucinated = [
    '**@Максим Денисов**',
    '- предложил сформировать план работы на следующий месяц',
    '**@Участник_Без_Имени**',
    '- подтвердил необходимость формирования плана',
    '**@Петров_Алексей**',
    '- поддержал идею о необходимости учитывать текущие задачи и сроки'
  ].join('\n')

  it('shows the LLM exactly one participant', () => {
    expect(namesInText(buildMessageText(messages, buildPersonNameMap(messages)))).toEqual(['Максим Денисов'])
  })

  it('keeps the real speaker and demotes the invented ones', () => {
    const out = replacePersonRefs(hallucinated, buildPersonNameMap(messages), CLASS_URI)

    expect(out).toContain('_id=maxim')
    expect(out).not.toContain('@Участник_Без_Имени')
    expect(out).not.toContain('@Петров_Алексей')
  })
})

/**
 * The same defect after the aibot rework, seen on stage 2026-09: the model no longer invents
 * opinions, but still adds a placeholder heading ("@Участники") to fill the multi-participant shape
 * the prompt suggests. It resolves to nobody, so it must not reach the document.
 */
describe('single-speaker meeting (empty placeholder heading)', () => {
  const messages = [
    msg('elena', 'Elena Ostapenko', 'Коллеги, всем привет. Давайте сформируем план работы на следующий месяц.')
  ]

  const withPlaceholder = [
    '**@Elena Ostapenko**',
    '- Предложение сформировать план работы на следующий месяц',
    '',
    '**@Участники**'
  ].join('\n')

  it('names a single participant in the roster', () => {
    expect(buildParticipantList(buildPersonNameMap(messages))).toBe('Elena Ostapenko')
  })

  it('drops the placeholder heading and keeps the real content', () => {
    const out = replacePersonRefs(withPlaceholder, buildPersonNameMap(messages), CLASS_URI)

    expect(out).toContain('_id=elena')
    expect(out).toContain('Предложение сформировать план работы на следующий месяц')
    expect(out).not.toContain('@Участники')
  })
})

describe('replacePersonRefs keeps legitimate content', () => {
  const map = buildPersonNameMap([msg('p1', 'Максим Денисов', 'a'), msg('p2', 'Анна Смирнова', 'b')])

  it('keeps every real participant section', () => {
    const out = replacePersonRefs('**@Максим Денисов**\n- план\n**@Анна Смирнова**\n- сроки', map, CLASS_URI)

    expect(out).toContain('_id=p1')
    expect(out).toContain('_id=p2')
    expect(out).toContain('- план')
    expect(out).toContain('- сроки')
  })

  // Only a heading on its own line names a participant; inside a sentence the name is a subject.
  it('leaves an inline mention of a non-participant alone', () => {
    const out = replacePersonRefs('**@Максим Денисов**\n- обсудить с **@Сергеем** сроки', map, CLASS_URI)

    expect(out).toContain('обсудить с **@Сергеем** сроки')
  })
})

/**
 * Multi-participant meeting with two namesakes, mirroring the seeded stand meeting. Two different
 * people share the display name "Петров,Иван", and the transcript mentions Сергей and Марина, who
 * were discussed but never attended.
 */
describe('multi-participant meeting with namesakes', () => {
  const messages = [
    msg('elena', 'Ostapenko,Elena', 'Коллеги, всем привет. Давайте сформируем план работы на следующий месяц.'),
    msg('ivan1', 'Петров,Иван', 'У меня по бэкенду две задачи, миграция и отчёты.'),
    msg('ivan2', 'Петров,Иван', 'По фронту я закрыл форму оплаты.'),
    msg('elena', 'Ostapenko,Elena', 'Сергей обещал прислать макеты, но он сегодня в отпуске.'),
    msg('ivan2', 'Петров,Иван', 'Согласен, подготовлю список сценариев к понедельнику.')
  ]
  const map = buildPersonNameMap(messages)

  it('gives the namesakes distinct labels', () => {
    expect(map.get('ivan1')).toBe('Петров,Иван (1)')
    expect(map.get('ivan2')).toBe('Петров,Иван (2)')
  })

  it('rosters all three participants and no one else', () => {
    expect(buildParticipantList(map)).toBe('Ostapenko,Elena, Петров,Иван (1), Петров,Иван (2)')
  })

  it('shows each namesake under their own label in the transcript', () => {
    const text = buildMessageText(messages, map)

    expect(text).toContain('@Петров,Иван (2)\nПо фронту я закрыл форму оплаты.')
    expect(text).toContain('@Петров,Иван (1)\nУ меня по бэкенду две задачи, миграция и отчёты.')
  })

  it('resolves each namesake section to a different person', () => {
    const summary = ['**@Петров,Иван (1)**', '- миграция и отчёты', '**@Петров,Иван (2)**', '- форма оплаты'].join('\n')
    const out = replacePersonRefs(summary, map, CLASS_URI)

    expect(out).toContain('_id=ivan1')
    expect(out).toContain('_id=ivan2')
  })

  // Сергей and Марина were talked about, never present: they resolve to nobody, so they must not
  // render as participant mentions. Their bullets are left in place - dropping real content is the
  // worse failure, and the text may still be about something that was said.
  it('demotes headings for people who were only mentioned', () => {
    const summary = [
      '**@Ostapenko,Elena**',
      '- план на следующий месяц',
      '**@Сергей**',
      '- обещал прислать макеты',
      '**@Марина**',
      '- обсудить нагрузочное тестирование'
    ].join('\n')
    const out = replacePersonRefs(summary, map, CLASS_URI)

    expect(out).toContain('_id=elena')
    expect(out).not.toContain('@Сергей')
    expect(out).not.toContain('@Марина')
    expect(out).toContain('**Сергей**')
    expect(out).toContain('обещал прислать макеты')
  })
})

/**
 * The model is told to keep names as they appear, but it rewrites them anyway: "Ostapenko,Elena"
 * comes back as "Elena Ostapenko". An earlier post-filter matched headings literally and deleted
 * every rewritten one, losing real participants and their bullets.
 */
describe('participant headings the model rewrote', () => {
  const map = buildPersonNameMap([msg('elena', 'Ostapenko,Elena', 'a')])

  it.each([
    ['**@Ostapenko,Elena**', 'as written'],
    ['**@Elena Ostapenko**', 'word order swapped'],
    ['**@Ostapenko, Elena**', 'space after the comma'],
    ['**@ostapenko,elena**', 'lower case'],
    ['**@Ostapenko  Elena**', 'double space']
  ])('resolves %s (%s)', (heading) => {
    const out = replacePersonRefs(`${heading}\n- предложила план`, map, CLASS_URI)

    expect(out).toContain('_id=elena')
    expect(out).toContain('- предложила план')
  })

  it('labels the ref with the roster spelling, not the rewritten one', () => {
    const out = replacePersonRefs('**@Elena Ostapenko**', map, CLASS_URI)

    expect(out).toContain(`label=${encodeURIComponent('Ostapenko,Elena')}`)
  })
})

/**
 * Namesakes are told apart by a `(n)` tag. When the model drops it the heading is ambiguous and must
 * not be attributed by guesswork - the previous scheme gave both sections to the first namesake.
 */
describe('namesake tags', () => {
  const namesakes = [msg('ivan1', 'Петров,Иван', 'a'), msg('ivan2', 'Петров,Иван', 'b')]
  const map = buildPersonNameMap(namesakes)

  it('leaves a unique name untagged', () => {
    const solo = buildPersonNameMap([msg('elena', 'Ostapenko,Elena', 'a'), msg('ivan1', 'Петров,Иван', 'b')])
    expect(solo.get('elena')).toBe('Ostapenko,Elena')
    expect(solo.get('ivan1')).toBe('Петров,Иван')
  })

  it('resolves each tagged heading to its own person', () => {
    const out = replacePersonRefs('**@Петров,Иван (1)**\n- бэкенд\n**@Петров,Иван (2)**\n- фронт', map, CLASS_URI)

    expect(out).toContain('_id=ivan1')
    expect(out).toContain('_id=ivan2')
  })

  it('resolves a tagged heading the model also rewrote', () => {
    expect(replacePersonRefs('**@Иван Петров (2)**', map, CLASS_URI)).toContain('_id=ivan2')
  })

  it('never attributes an untagged namesake heading to a guess', () => {
    const out = replacePersonRefs('**@Петров,Иван**\n- бэкенд', map, CLASS_URI)

    expect(out).not.toContain('_id=ivan1')
    expect(out).not.toContain('_id=ivan2')
    expect(out).toContain('- бэкенд')
  })

  // The whole point of the tag: two sections must not collapse onto one person.
  it('does not give both sections to the first namesake', () => {
    const out = replacePersonRefs('**@Петров,Иван (1)**\n- бэкенд\n**@Петров,Иван (2)**\n- фронт', map, CLASS_URI)

    expect(out.match(/_id=ivan1/g)).toHaveLength(1)
    expect(out.match(/_id=ivan2/g)).toHaveLength(1)
  })
})

/**
 * "Ostapenko Elena" came back as "Остапенко Елена" and resolved to nobody. The fallback matches
 * across scripts, but only on a unique roster hit - a wrong link is worse than no link.
 */
describe('transliterated headings', () => {
  const map = buildPersonNameMap([msg('elena', 'Ostapenko Elena', 'a'), msg('ivan', 'Петров Иван', 'b')])

  it.each([
    ['**@Остапенко Елена**', 'cyrillic, as the model wrote it'],
    ['**@Елена Остапенко**', 'cyrillic and reordered'],
    ['**@Ostapenko Elena**', 'left in latin as asked']
  ])('resolves %s (%s)', (heading) => {
    expect(replacePersonRefs(`${heading}\n- план`, map, CLASS_URI)).toContain('_id=elena')
  })

  it('still resolves a name that was already cyrillic', () => {
    expect(replacePersonRefs('**@Петров Иван**', map, CLASS_URI)).toContain('_id=ivan')
  })

  it('labels the ref with the roster spelling, not the transliterated one', () => {
    const out = replacePersonRefs('**@Остапенко Елена**', map, CLASS_URI)
    expect(out).toContain(`label=${encodeURIComponent('Ostapenko Elena')}`)
  })

  it('does not link a heading that is nobody on the roster', () => {
    const out = replacePersonRefs('**@Сергей Кузнецов**\n- макеты', map, CLASS_URI)

    expect(out).not.toContain('ref://')
    expect(out).toContain('**Сергей Кузнецов**')
  })

  // Two namesakes transliterate to the same key: the fallback must not pick one of them.
  it('refuses a transliterated namesake heading', () => {
    const twins = buildPersonNameMap([msg('i1', 'Петров Иван', 'a'), msg('i2', 'Петров Иван', 'b')])
    const out = replacePersonRefs('**@Petrov Ivan**\n- бэкенд', twins, CLASS_URI)

    expect(out).not.toContain('ref://')
    expect(out).toContain('- бэкенд')
  })
})

/** The overview heading carries no `@`: it names the meeting, not a person, and must survive. */
describe('meeting overview heading', () => {
  const map = buildPersonNameMap([msg('elena', 'Ostapenko Elena', 'a')])

  it('passes through untouched, with its bullets', () => {
    const out = replacePersonRefs(
      '**Итоги встречи**\n- обсудили план\n\n**@Ostapenko Elena**\n- предложила',
      map,
      CLASS_URI
    )

    expect(out).toContain('**Итоги встречи**')
    expect(out).toContain('- обсудили план')
    expect(out).toContain('_id=elena')
  })
})

/**
 * The model opens a new section each time a person speaks again; three rounds of prompt wording
 * failed to stop that, so the repeats are merged in code.
 */
describe('mergePersonSections', () => {
  it('folds a repeated section into the first one for that person', () => {
    const out = mergePersonSections(
      ['**@Елена**', '- план на месяц', '', '**@Иван**', '- бэкенд', '', '**@Елена**', '- встреча в понедельник'].join(
        '\n'
      )
    )

    expect(out).toBe(
      ['**@Елена**', '- план на месяц', '- встреча в понедельник', '', '**@Иван**', '- бэкенд'].join('\n')
    )
  })

  it('keeps the order in which participants first appear', () => {
    const out = mergePersonSections('**@Б**\n- b1\n\n**@А**\n- a1\n\n**@Б**\n- b2')
    expect(out.indexOf('**@Б**')).toBeLessThan(out.indexOf('**@А**'))
  })

  it('keeps the unheaded overview above the sections', () => {
    const out = mergePersonSections('- обсудили план\n- решили встретиться\n\n**@Елена**\n- план')

    expect(out.startsWith('- обсудили план\n- решили встретиться')).toBe(true)
    expect(out).toContain('**@Елена**')
  })

  it('leaves a summary that has no repeats alone', () => {
    const text = '**@Елена**\n- план\n\n**@Иван**\n- бэкенд'
    expect(mergePersonSections(text)).toBe(text)
  })

  it('matches headings regardless of case and spacing', () => {
    const out = mergePersonSections('**@Елена Остапенко**\n- a\n\n**@елена остапенко **\n- b')

    expect(out.match(/\*\*@/g) ?? []).toHaveLength(1)
    expect(out).toContain('- a')
    expect(out).toContain('- b')
  })

  it('keeps namesakes apart - the tag makes them different people', () => {
    const out = mergePersonSections('**@Иван (1)**\n- бэкенд\n\n**@Иван (2)**\n- фронт')

    expect(out.match(/\*\*@/g) ?? []).toHaveLength(2)
  })

  it('returns text with no participant heading unchanged', () => {
    expect(mergePersonSections('- просто буллет\n- ещё один')).toBe('- просто буллет\n- ещё один')
  })

  it('merges before refs resolve, so each person still links once', () => {
    const map = buildPersonNameMap([msg('elena', 'Ostapenko Elena', 'a'), msg('ivan', 'Петров Иван', 'b')])
    const merged = mergePersonSections(
      '**@Ostapenko Elena**\n- план\n\n**@Петров Иван**\n- бэкенд\n\n**@Ostapenko Elena**\n- итог'
    )
    const out = replacePersonRefs(merged, map, CLASS_URI)

    expect(out.match(/_id=elena/g) ?? []).toHaveLength(1)
    expect(out).toContain('- план')
    expect(out).toContain('- итог')
  })
})

/**
 * The `(n)` tag leaked into prose ("У Ивана Петрова (1) две задачи"), where nothing explains the
 * number. It also says who is meant, so a name the model got wrong is restored, not just unmarked.
 */
describe('stripTagsInProse', () => {
  const map = buildPersonNameMap([msg('i1', 'Петров Иван', 'a'), msg('i2', 'Петров Иван', 'b')])

  it.each([
    ['- У Ивана Петрова (1) две задачи', '- У Ивана Петрова две задачи'],
    ['- Иван Петров (2) завершил форму оплаты', '- Иван Петров завершил форму оплаты'],
    ['- Петрову Ивану (2) поручено подготовить сценарии', '- Петрову Ивану поручено подготовить сценарии'],
    ['- Иван (1) уточнил сроки', '- Иван уточнил сроки']
  ])('keeps the declension the model wrote in %s', (line, expected) => {
    expect(stripTagsInProse(line, map)).toBe(expected)
  })

  // The model shortened "Петров Иван" to "Пётр" in an overview bullet; dropping only the tag would
  // leave a confident wrong name, so the roster name replaces it.
  it('restores a name the model got wrong', () => {
    expect(stripTagsInProse('- Пётр (2) подготовит сценарии.', map)).toBe('- Петров Иван подготовит сценарии.')
  })

  it('keeps the tag in a section heading, where the resolver needs it', () => {
    expect(stripTagsInProse('**@Петров Иван (1)**', map)).toBe('**@Петров Иван (1)**')
  })

  it('leaves a parenthesised number that is not a namesake tag', () => {
    expect(stripTagsInProse('- этап (3) закрыт', map)).toBe('- этап (3) закрыт')
  })

  it('does nothing when the meeting has no namesakes', () => {
    const solo = buildPersonNameMap([msg('elena', 'Ostapenko Elena', 'a')])
    expect(stripTagsInProse('- Ostapenko Elena (1) предложила план', solo)).toBe(
      '- Ostapenko Elena (1) предложила план'
    )
  })

  it('cleans the prose while the heading still resolves to the right person', () => {
    const summary = ['- Иван Петров (2) завершил форму оплаты', '', '**@Петров Иван (2)**', '- форма оплаты'].join('\n')
    const out = replacePersonRefs(stripTagsInProse(summary, map), map, CLASS_URI)

    expect(out).toContain('- Иван Петров завершил форму оплаты')
    expect(out).toContain('_id=i2')
  })
})
