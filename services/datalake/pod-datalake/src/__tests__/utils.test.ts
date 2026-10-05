import { unwrapETag } from '../datalake/utils'

describe('unwrapETag', () => {
  it('strips weak prefix and quotes', () => {
    expect(unwrapETag('W/"abc"')).toBe('abc')
    expect(unwrapETag('"abc"')).toBe('abc')
  })

  it('keeps a lone quote', () => {
    expect(unwrapETag('"')).toBe('"')
  })
})
