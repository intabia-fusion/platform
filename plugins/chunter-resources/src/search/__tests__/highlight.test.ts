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

import { HIGHLIGHT_POST, HIGHLIGHT_PRE, matchedTerms, splitHighlight } from '../highlight'

const mark = (text: string): string => `${HIGHLIGHT_PRE}${text}${HIGHLIGHT_POST}`

describe('splitHighlight', () => {
  it('returns plain text untouched', () => {
    expect(splitHighlight('just text')).toEqual([{ text: 'just text', marked: false }])
  })

  it('splits a highlighted run out of its surroundings', () => {
    expect(splitHighlight(`the ${mark('release')} notes`)).toEqual([
      { text: 'the ', marked: false },
      { text: 'release', marked: true },
      { text: ' notes', marked: false }
    ])
  })

  it('handles several matches in one fragment', () => {
    expect(splitHighlight(`${mark('a')} and ${mark('b')}`)).toEqual([
      { text: 'a', marked: true },
      { text: ' and ', marked: false },
      { text: 'b', marked: true }
    ])
  })

  it('renders a literal em tag as text, never as markup', () => {
    const parts = splitHighlight(`code <em>tag</em> ${mark('here')}`)
    expect(parts.map((p) => p.text).join('')).toEqual('code <em>tag</em> here')
    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['here'])
  })

  it('treats an unclosed match as running to the end of the window', () => {
    // The engine returns a window of the field, so a match can be cut in half.
    expect(splitHighlight(`broken ${HIGHLIGHT_PRE}tail`)).toEqual([
      { text: 'broken ', marked: false },
      { text: 'tail', marked: true }
    ])
  })

  it('returns nothing for an empty fragment', () => {
    expect(splitHighlight('')).toEqual([])
  })

  it('keeps a match that starts the fragment', () => {
    expect(splitHighlight(`${mark('release')} notes`)).toEqual([
      { text: 'release', marked: true },
      { text: ' notes', marked: false }
    ])
  })

  it('keeps a match that ends the fragment', () => {
    expect(splitHighlight(`the ${mark('release')}`)).toEqual([
      { text: 'the ', marked: false },
      { text: 'release', marked: true }
    ])
  })

  it('drops an empty marked run rather than rendering a blank mark', () => {
    expect(splitHighlight(`a ${mark('')} b`)).toEqual([
      { text: 'a ', marked: false },
      { text: ' b', marked: false }
    ])
  })

  it('splits cyrillic the same way', () => {
    expect(splitHighlight(`дата ${mark('релиза')} близко`)).toEqual([
      { text: 'дата ', marked: false },
      { text: 'релиза', marked: true },
      { text: ' близко', marked: false }
    ])
  })
})

describe('matchedTerms', () => {
  it('reads back the words the engine marked', () => {
    expect(matchedTerms([`the ${mark('release')} notes`])).toEqual(['release'])
  })

  it('collects across several fragments', () => {
    expect(matchedTerms([`${mark('release')} notes`, `the ${mark('quarterly')} report`])).toEqual([
      'release',
      'quarterly'
    ])
  })

  it('reports a repeated word once', () => {
    // The same term usually matches in more than one fragment; marking it twice is pointless.
    expect(matchedTerms([`${mark('release')} a`, `b ${mark('release')}`])).toEqual(['release'])
  })

  it('takes the form the engine matched, not the one that was typed', () => {
    // A query of `релиз` hits `релиза` through the stemmer, and the text says `релиза`.
    expect(matchedTerms([`дата ${mark('релиза')} близко`])).toEqual(['релиза'])
  })

  it('returns nothing when no fragment carries a match', () => {
    expect(matchedTerms(['plain text', ''])).toEqual([])
  })

  it('returns nothing for no fragments at all', () => {
    expect(matchedTerms([])).toEqual([])
  })

  it('ignores a match cut off by the end of the window', () => {
    // Half a word is not a word: marking `rele` would highlight the wrong run in the message.
    expect(matchedTerms([`broken ${HIGHLIGHT_PRE}rele`])).toEqual([])
  })

  it('strips the newlines the indexer joins attributes with', () => {
    expect(matchedTerms([`a ${HIGHLIGHT_PRE}\n release \n${HIGHLIGHT_POST} b`])).toEqual(['release'])
  })

  it('skips a marked run that holds nothing but whitespace', () => {
    expect(matchedTerms([`a ${mark('  ')} b`])).toEqual([])
  })

  it('collects every match in one fragment', () => {
    expect(matchedTerms([`${mark('release')} and ${mark('notes')}`])).toEqual(['release', 'notes'])
  })
})
