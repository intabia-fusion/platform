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

import { PROMPTS } from '../llms/prompts'

/**
 * Rules earned the hard way on live runs; each one is here because its absence produced a concrete
 * defect. Editing the prompt is easy and the damage is invisible until a meeting is summarized, so
 * the rules are pinned rather than trusted to review.
 */
describe('summarizeMessages prompt', () => {
  const prompt = PROMPTS.SUMMARIZE_MESSAGES('ru', undefined, 'Ostapenko Elena, Петров Иван (1), Петров Иван (2)')

  it('renders the roster and leaves no placeholder behind', () => {
    expect(prompt).toContain('Ostapenko Elena, Петров Иван (1), Петров Иван (2)')
    expect(prompt).not.toContain('{{')
  })

  // The model dropped the @ once and every link in the summary disappeared.
  it('states that @ is required markup', () => {
    expect(prompt).toContain('required markup, never part of the name')
  })

  // "Ostapenko Elena" came back as "Остапенко Елена" and resolved to nobody.
  it('forbids translating or transliterating a name', () => {
    expect(prompt).toMatch(/transliterate it into the language of the summary/)
  })

  // A shared "X и Y" heading cannot be repaired afterwards, so it stays forbidden. Repeated
  // sections for one person are merged in mergePersonSections rather than pinned here.
  it('forbids a heading that names two people', () => {
    expect(prompt).toContain('no conjunction in any language')
    expect(prompt).toContain('A heading contains ONE name and nothing else')
  })

  // The transcript is chronological again: the model must read it as a conversation, not merge
  // two moments into one fact (mockups from Sergey + a talk with Marina became a single bullet).
  it('explains that the transcript is chronological', () => {
    expect(prompt).toContain('The transcript below is chronological')
    expect(prompt).toContain('Never merge two separate moments into one statement')
  })

  // "Sergey promised the mockups" collapsed into "the mockups are missing".
  it('keeps a named person in the bullet', () => {
    expect(prompt).toContain('who owes what is the point of the line')
  })

  // "нагрузочное тестирование" came back as "нагрузку" and as "нагрузку-тестирование".
  // "нагрузочное тестирование" came back as "нагрузку-тестирование": the rule used an English
  // example, which did not carry over to the language the summary is written in.
  it('forbids shortening or splicing a multi-word term, in any language', () => {
    expect(prompt).toContain('in the language they were spoken in')
    expect(prompt).toContain('glue its words together with a hyphen')
  })

  it('does not demand a heading for a participant who said nothing', () => {
    expect(prompt).toContain('one section per participant who said something of substance')
    expect(prompt).not.toContain('equals the number of participants')
  })

  // Requested by the product owner: a whole-meeting overview ahead of the per-person sections,
  // with no heading of its own - the document already has a title above it.
  it('asks for an unheaded meeting overview', () => {
    expect(prompt).toContain('Open with 2 to 5 bullets about the meeting as a whole')
    expect(prompt).toContain('Open with 2 to 5 bullets about the meeting as a whole')
    expect(prompt).toContain('NO heading of any kind above them')
  })

  // The tag leaked into the prose because the rule used to say "every heading and mention".
  it('confines the namesake tag to section headings', () => {
    expect(prompt).toContain('Write that tag in the section HEADING only')
    expect(prompt).toContain('write the plain name with no tag')
  })

  // "Пётр (2) подготовит сценарии" - the model shortened a participant's name in the overview.
  it('demands the full roster name wherever a participant is named', () => {
    expect(prompt).toContain('write their name in full as the roster spells it')
    expect(prompt).toContain('This holds above all in the opening overview')
  })

  it('renders the agenda block only when a description is given', () => {
    expect(PROMPTS.SUMMARIZE_MESSAGES('ru', undefined, 'A')).not.toContain('Meeting description')
    expect(PROMPTS.SUMMARIZE_MESSAGES('ru', 'Обсудить план', 'A')).toContain('Обсудить план')
  })
})
