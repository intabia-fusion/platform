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

import { collectTerms, highlightMarkup, highlightRuns } from '../highlight'
import { MarkupMarkType, MarkupNodeType, type MarkupNode } from '../model'

const doc = (...content: MarkupNode[]): MarkupNode => ({ type: MarkupNodeType.doc, content })
const p = (...content: MarkupNode[]): MarkupNode => ({ type: MarkupNodeType.paragraph, content })
const t = (text: string, ...marks: MarkupMarkType[]): MarkupNode => ({
  type: MarkupNodeType.text,
  text,
  ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {})
})

const isHighlight = (m: { type: MarkupMarkType }): boolean => m.type === MarkupMarkType.highlight

/** Flattens to `[text, highlighted]` pairs in document order. */
function runs (node: MarkupNode): Array<[string, boolean]> {
  if (node.type === MarkupNodeType.text) {
    return [[node.text ?? '', (node.marks ?? []).some(isHighlight)]]
  }
  return (node.content ?? []).flatMap(runs)
}

describe('collectTerms', () => {
  it('splits a query into usable terms', () => {
    expect(collectTerms('релиз заметки')).toEqual(['релиз', 'заметки'])
  })

  it('drops single characters and punctuation', () => {
    expect(collectTerms('a релиз, - !')).toEqual(['релиз'])
  })

  it('deduplicates', () => {
    expect(collectTerms('релиз релиз')).toEqual(['релиз'])
  })
})

describe('highlightMarkup', () => {
  it('marks a matching word', () => {
    const out = highlightMarkup(doc(p(t('заметки о релизе продукта'))), ['релизе'])
    expect(runs(out)).toEqual([
      ['заметки о ', false],
      ['релизе', true],
      [' продукта', false]
    ])
  })

  it('marks only what matched, not the word around it', () => {
    // The engine stems, so a term can be a prefix of the word it found - but marking the whole
    // word overstates the match and hides where it ends.
    const out = highlightMarkup(doc(p(t('дата релиза близко'))), ['релиз'])
    expect(runs(out)).toEqual([
      ['дата ', false],
      ['релиз', true],
      ['а близко', false]
    ])
  })

  it('marks a short term wherever a word starts with it', () => {
    // Only the two characters are marked, so this reads as a hint rather than as whole words
    // lighting up for no reason.
    const out = highlightMarkup(doc(p(t('Напишу ответ на вопрос'))), ['на'])
    expect(runs(out)).toEqual([
      ['На', true],
      ['пишу ответ ', false],
      ['на', true],
      [' вопрос', false]
    ])
  })

  it('still marks a short term standing as its own word', () => {
    expect(runs(highlightMarkup(doc(p(t('ответ на вопрос'))), ['на']))).toEqual([
      ['ответ ', false],
      ['на', true],
      [' вопрос', false]
    ])
  })

  it('marks a half typed word without swallowing the rest of it', () => {
    expect(runs(highlightMarkup(doc(p(t('План на планёрку'))), ['пла']))).toEqual([
      ['Пла', true],
      ['н на ', false],
      ['пла', true],
      ['нёрку', false]
    ])
  })

  it('always marks something when the term occurs at all', () => {
    // A result that was found must show why, even when the term only starts a longer word.
    expect(runs(highlightMarkup(doc(p(t('Смотри настройках'))), ['на']))).toEqual([
      ['Смотри ', false],
      ['на', true],
      ['стройках', false]
    ])
  })

  it('marks what the engine reported', () => {
    // The engine stems and tolerates typos, so it is the one that knows which word a misspelled
    // query actually hit - the word it reports is what gets marked.
    expect(runs(highlightMarkup(doc(p(t('План на завтра'))), ['План']))).toEqual([
      ['План', true],
      [' на завтра', false]
    ])
  })

  it('marks a mention whose name was hit', () => {
    const mention: MarkupNode = {
      type: MarkupNodeType.reference,
      attrs: { id: 'p1', objectclass: 'contact:class:Person', label: 'Sobolev Andrey' }
    }
    const out = highlightMarkup(doc(p(mention, t(' ping'))), ['Sobolev'])
    const node = out.content?.[0].content?.[0]
    expect(node?.type).toBe(MarkupNodeType.reference)
    expect(node?.attrs?.highlight).toBe('sobolev')
    expect(node?.attrs?.label).toBe('Sobolev Andrey')
    expect(runs(out)).toEqual([[' ping', false]])
  })

  it('splits a name into runs around the hit', () => {
    expect(highlightRuns('Sobolev Andrey', 'sobolev')).toEqual([
      { text: 'Sobolev', marked: true },
      { text: ' Andrey', marked: false }
    ])
    expect(highlightRuns('Sobolev Andrey', 'ping')).toEqual([{ text: 'Sobolev Andrey', marked: false }])
  })

  it('widens a hit to the whole word when asked', () => {
    // `and` is only the start of `Andrey`; the name must not come out as `And|rey`.
    expect(highlightRuns('Sobolev Andrey', 'sobolev and', { wholeWords: true })).toEqual([
      { text: 'Sobolev', marked: true },
      { text: ' ', marked: false },
      { text: 'Andrey', marked: true }
    ])
    expect(highlightRuns('Andrey', 'and', { wholeWords: true })).toEqual([{ text: 'Andrey', marked: true }])
  })

  it('leaves a mention alone when its name was not hit', () => {
    const mention: MarkupNode = {
      type: MarkupNodeType.reference,
      attrs: { id: 'p1', objectclass: 'contact:class:Person', label: 'Sobolev Andrey' }
    }
    const out = highlightMarkup(doc(p(mention, t(' ping'))), ['ping'])
    const node = out.content?.[0].content?.[0]
    expect(node?.attrs?.highlight).toBeUndefined()
  })

  it('marks nothing when the engine reported nothing', () => {
    // Never guesses alongside the engine: with no hits to go on there is nothing to mark, and
    // deriving terms from the raw query would light up words the search never matched.
    expect(runs(highlightMarkup(doc(p(t('План на завтра'))), []))).toEqual([['План на завтра', false]])
  })

  it('prefers exact hits over near ones', () => {
    // The term occurs outright, so a longer word starting with it must not be marked whole just
    // because it is close.
    expect(runs(highlightMarkup(doc(p(t('План и планёрка'))), ['план']))).toEqual([
      ['План', true],
      [' и ', false],
      ['план', true],
      ['ёрка', false]
    ])
  })

  it('does not treat a two letter term as a typo of everything', () => {
    // With one edit allowed, a two letter term would match most other short words.
    expect(runs(highlightMarkup(doc(p(t('не за что'))), ['на']))).toEqual([['не за что', false]])
  })

  it('does not match inside a word', () => {
    // The term occurs in the text, but in mid word rather than at a word boundary.
    const out = highlightMarkup(doc(p(t('релиз готов'))), ['лиз'])
    expect(runs(out)).toEqual([['релиз готов', false]])
  })

  it('keeps the formatting of the run it splits', () => {
    const out = highlightMarkup(doc(p(t('важный релиз', MarkupMarkType.bold))), ['релиз'])
    const marked = (out.content?.[0].content ?? []).map((n) => ({
      text: n.text,
      bold: (n.marks ?? []).some((m) => m.type === MarkupMarkType.bold),
      hl: (n.marks ?? []).some(isHighlight)
    }))
    expect(marked).toEqual([
      { text: 'важный ', bold: true, hl: false },
      { text: 'релиз', bold: true, hl: true }
    ])
  })

  it('marks every occurrence', () => {
    const out = highlightMarkup(doc(p(t('релиз и ещё релиз'))), ['релиз'])
    expect(runs(out).filter((r) => r[1]).length).toEqual(2)
  })

  it('marks several terms', () => {
    const out = highlightMarkup(doc(p(t('заметки о релизе'))), ['заметки', 'релизе'])
    expect(runs(out)).toEqual([
      ['заметки', true],
      [' о ', false],
      ['релизе', true]
    ])
  })

  it('merges overlapping matches instead of splitting a word', () => {
    // Both terms land inside the same word.
    const out = highlightMarkup(doc(p(t('релизный процесс'))), ['релиз', 'релизный'])
    expect(runs(out)).toEqual([
      ['релизный', true],
      [' процесс', false]
    ])
  })

  it('reaches text nested in lists and quotes', () => {
    const list: MarkupNode = {
      type: MarkupNodeType.bullet_list,
      content: [{ type: MarkupNodeType.list_item, content: [p(t('пункт про релиз'))] }]
    }
    expect(runs(highlightMarkup(doc(list), ['релиз'])).filter((r) => r[1])).toEqual([['релиз', true]])
  })

  it('is case insensitive', () => {
    expect(runs(highlightMarkup(doc(p(t('Релиз'))), ['релиз']))).toEqual([['Релиз', true]])
  })

  it('keeps the text intact for unusual input', () => {
    const texts = ['релиз 👍 готов', '𝐫𝐞𝐥𝐢𝐳 релиз', 'ре\u200Bлиз релиз', 'STRASSE релиз']
    for (const text of texts) {
      expect(
        runs(highlightMarkup(doc(p(t(text))), ['релиз']))
          .map((r) => r[0])
          .join('')
      ).toEqual(text)
    }
  })

  it('leaves the document alone when nothing matches', () => {
    const input = doc(p(t('ничего похожего')))
    expect(highlightMarkup(input, ['релиз'])).toEqual(input)
  })

  it('leaves the document alone for an unusable query', () => {
    const input = doc(p(t('текст')))
    expect(highlightMarkup(input, ['a', '!'])).toEqual(input)
  })

  it('does not modify the input', () => {
    const input = doc(p(t('релиз готов')))
    const copy = JSON.parse(JSON.stringify(input))
    highlightMarkup(input, ['релиз'])
    expect(input).toEqual(copy)
  })
})
