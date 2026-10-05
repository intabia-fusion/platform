import type { Doc } from '../classes'
import { createPredicates } from '../predicate'

const doc = (extra: Record<string, any>): Doc => ({ _id: '1', _class: 'test', ...extra }) as unknown as Doc

describe('predicates', () => {
  it('$all returns false for non-array field values', () => {
    const [pred] = createPredicates({ $all: [1] }, 'f')
    expect(pred([doc({ f: 5 }), doc({ f: 'str' }), doc({}), doc({ f: null })])).toEqual([])
    const arr = doc({ f: [1, 2] })
    expect(pred([arr])).toEqual([arr])
  })

  it('$regex returns false for non-string field values', () => {
    const [pred] = createPredicates({ $regex: { $regex: 'a', $options: '' } }, 'f')
    expect(pred([doc({ f: 5 }), doc({}), doc({ f: null })])).toEqual([])
    const str = doc({ f: 'abc' })
    expect(pred([str])).toEqual([str])
  })

  it('unknown predicate error names the missing key', () => {
    expect(() => createPredicates({ $in: [1], $bogus: 1 }, 'f')).toThrow('unknown predicate: $bogus')
  })
})
