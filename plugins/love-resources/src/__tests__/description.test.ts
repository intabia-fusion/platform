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

import { descriptionMarkup, descriptionText } from '../description'

const doc = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  })

describe('descriptionText', () => {
  it('reads the text of a markup document', () => {
    expect(descriptionText(doc('Проверка 123'))).toBe('Проверка 123')
  })

  it('keeps plain text as it is', () => {
    expect(descriptionText('Проверка 123')).toBe('Проверка 123')
  })

  it('unwraps a document that was written into the text field', () => {
    // A build that put the markup into the text field stored it as the text of another document.
    const doubled = doc(doc('Проверка 123'))
    expect(descriptionText(doubled)).toBe('Проверка 123')
  })

  it('does not treat a text that starts with a brace as markup', () => {
    expect(descriptionText('{не json')).toBe('{не json')
  })

  it('returns nothing for an empty description', () => {
    expect(descriptionText(undefined)).toBe('')
    expect(descriptionText('')).toBe('')
  })
})

describe('descriptionMarkup', () => {
  it('wraps plain text into a document', () => {
    expect(descriptionMarkup('Проверка 123')).toBe(doc('Проверка 123'))
  })

  it('keeps a document as it is', () => {
    const markup = doc('Проверка 123')
    expect(descriptionMarkup(markup)).toBe(markup)
  })

  it('wraps a text that only looks like json', () => {
    expect(descriptionMarkup('{не json')).toBe(doc('{не json'))
  })

  it('returns an empty string for an empty text', () => {
    expect(descriptionMarkup('   ')).toBe('')
  })
})
