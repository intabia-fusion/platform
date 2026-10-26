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

import { indentJson } from '../jsonText'

describe('indentJson', () => {
  it('indents like JSON.stringify for plain values', () => {
    const text = '{"a":1,"b":[true,null,"x"],"c":{"d":{}},"e":[]}'
    expect(indentJson(text)).toBe(JSON.stringify(JSON.parse(text), null, 2))
  })

  it('keeps big numbers, key order and number spelling', () => {
    const text = '{"b":1,"10":2,"2":3,"id":12345678901234567890,"f":1.0,"g":1e3}'
    expect(indentJson(text)).toBe(
      '{\n  "b": 1,\n  "10": 2,\n  "2": 3,\n  "id": 12345678901234567890,\n  "f": 1.0,\n  "g": 1e3\n}'
    )
  })

  it('keeps strings as written', () => {
    const text = '{"s":"a, b: {c} [d] \\"q\\" \\\\ \\u0041  "}'
    expect(indentJson(text)).toBe('{\n  "s": "a, b: {c} [d] \\"q\\" \\\\ \\u0041  "\n}')
  })

  it('re-indents already formatted text', () => {
    const text = '{\n    "a" : [ 1 ,\n 2 ],\n "b" : { }\n}'
    expect(indentJson(text)).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": {}\n}')
  })

  it('returns text that is not JSON as is', () => {
    expect(indentJson('{"a":1,}')).toBe('{"a":1,}')
    expect(indentJson('')).toBe('')
  })
})
