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

import chunter from '@hcengineering/chunter'
import { decodeChatURI, parseChunterSpaceLinkId, toChunterSpaceLinkId } from '../linkId'

const id = '6ab563cdad9fa7c25f0b4f94'

describe('chat link ids', () => {
  it('round-trips generated ids through a name slug', () => {
    expect(toChunterSpaceLinkId(id, 'Dumpa Lumpa')).toBe(`dumpa-lumpa-${id}`)
    expect(parseChunterSpaceLinkId(`dumpa-lumpa-${id}`)).toBe(id)
    expect(toChunterSpaceLinkId(id, 'Иван Петров')).toBe(`ivan-petrov-${id}`)
  })

  it('keeps the id bare when the name gives no slug', () => {
    expect(toChunterSpaceLinkId(id, '')).toBe(id)
    expect(parseChunterSpaceLinkId(id)).toBe(id)
  })

  it('does not mistake a slug ending in "space" for a model channel', () => {
    expect(parseChunterSpaceLinkId(`my-space-${id}`)).toBe(id)
  })

  it('maps model channels to dashes and back', () => {
    expect(toChunterSpaceLinkId('chunter:space:General', 'general')).toBe('chunter-space-General')
    expect(parseChunterSpaceLinkId('chunter-space-General')).toBe('chunter:space:General')
    expect(parseChunterSpaceLinkId('chunter:space:General')).toBe('chunter:space:General')
  })

  it('decodes old `<id>|<class>` links and class-less ones', () => {
    expect(decodeChatURI(`${id}%7Cchunter%3Aclass%3ADirectMessage`)).toEqual([id, chunter.class.DirectMessage])
    expect(decodeChatURI(`dumpa-lumpa-${id}`)).toEqual([`dumpa-lumpa-${id}`, chunter.class.ChunterSpace])
    expect(decodeChatURI(undefined)).toEqual([''])
  })
})
