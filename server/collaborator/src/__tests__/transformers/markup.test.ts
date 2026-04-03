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

import { MarkupTransformer } from '../../transformers/markup'
import { Doc } from 'yjs'

jest.mock('@hcengineering/text-ydoc', () => ({
  markupToYDoc: jest.fn(),
  yDocToMarkup: jest.fn()
}))

const mockMarkupToYDoc = jest.requireMock('@hcengineering/text-ydoc').markupToYDoc
const mockYDocToMarkup = jest.requireMock('@hcengineering/text-ydoc').yDocToMarkup

describe('MarkupTransformer', () => {
  let transformer: MarkupTransformer

  beforeEach(() => {
    transformer = new MarkupTransformer()
    jest.clearAllMocks()
  })

  describe('fromYdoc', () => {
    it('should convert single field from YDoc to markup', () => {
      const mockDoc = new Doc()
      mockYDocToMarkup.mockReturnValue('<p>Hello World</p>')

      const result = transformer.fromYdoc(mockDoc, 'content')

      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'content')
      expect(result).toBe('<p>Hello World</p>')
    })

    it('should convert multiple fields from YDoc to markup when array provided', () => {
      const mockDoc = new Doc()
      mockYDocToMarkup.mockReturnValueOnce('<p>Content 1</p>').mockReturnValueOnce('<p>Content 2</p>')

      const result = transformer.fromYdoc(mockDoc, ['content', 'description'])

      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'content')
      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'description')
      expect(result).toEqual({
        content: '<p>Content 1</p>',
        description: '<p>Content 2</p>'
      })
    })

    it('should use document share keys when fieldName is undefined', () => {
      const mockDoc = new Doc()
      mockDoc.share.set('field1', {} as any)
      mockDoc.share.set('field2', {} as any)

      mockYDocToMarkup.mockReturnValueOnce('markup1').mockReturnValueOnce('markup2')

      const result = transformer.fromYdoc(mockDoc, undefined)

      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'field1')
      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'field2')
      expect(result).toEqual({
        field1: 'markup1',
        field2: 'markup2'
      })
    })

    it('should use document share keys when fieldName is empty array', () => {
      const mockDoc = new Doc()
      mockDoc.share.set('content', {} as any)

      mockYDocToMarkup.mockReturnValue('markup')

      const result = transformer.fromYdoc(mockDoc, [])

      expect(mockYDocToMarkup).toHaveBeenCalledWith(mockDoc, 'content')
      expect(result).toEqual({ content: 'markup' })
    })

    it('should handle document with no shared fields', () => {
      const mockDoc = new Doc()

      const result = transformer.fromYdoc(mockDoc, undefined)

      expect(result).toEqual({})
    })
  })

  describe('toYdoc', () => {
    it('should convert markup string to YDoc', () => {
      const mockYDoc = new Doc()
      mockMarkupToYDoc.mockReturnValue(mockYDoc)

      const markup = '<p>Test content</p>'
      const result = transformer.toYdoc(markup, 'content')

      expect(mockMarkupToYDoc).toHaveBeenCalledWith(markup, 'content')
      expect(result).toBe(mockYDoc)
    })

    it('should return empty YDoc when markup is empty string', () => {
      const result = transformer.toYdoc('', 'content')

      expect(mockMarkupToYDoc).not.toHaveBeenCalled()
      expect(result).toBeInstanceOf(Doc)
    })

    it('should return empty YDoc when markup is not a string', () => {
      const result = transformer.toYdoc(null, 'content')

      expect(mockMarkupToYDoc).not.toHaveBeenCalled()
      expect(result).toBeInstanceOf(Doc)
    })

    it('should return empty YDoc when markup is undefined', () => {
      const result = transformer.toYdoc(undefined, 'content')

      expect(mockMarkupToYDoc).not.toHaveBeenCalled()
      expect(result).toBeInstanceOf(Doc)
    })

    it('should handle object input by returning empty YDoc', () => {
      const result = transformer.toYdoc({} as any, 'content')

      expect(mockMarkupToYDoc).not.toHaveBeenCalled()
      expect(result).toBeInstanceOf(Doc)
    })

    it('should use provided fieldName', () => {
      const mockYDoc = new Doc()
      mockMarkupToYDoc.mockReturnValue(mockYDoc)

      transformer.toYdoc('<p>Content</p>', 'description')

      expect(mockMarkupToYDoc).toHaveBeenCalledWith('<p>Content</p>', 'description')
    })
  })
})
