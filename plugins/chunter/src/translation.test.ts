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

import { TxProcessor, type Markup } from '@hcengineering/core'
import chunter, { hashMessage } from './index'

describe('message translations', () => {
  it('keeps translations of different versions and languages independent', () => {
    const oldHash = hashMessage('old' as Markup)
    const currentHash = hashMessage('current' as Markup)
    const message: any = { message: 'current' }
    const save = (hash: string, language: string, text: string): void => {
      TxProcessor.updateMixin4Doc(message, {
        mixin: chunter.mixin.MessageTranslations,
        attributes: { [`entries.${hash}.${language}`]: text }
      } as any)
    }

    save(currentHash, 'en', 'current translation')
    save(oldHash, 'en', 'late old translation')
    save(currentHash, 'ru', 'another language')

    const entries = message[chunter.mixin.MessageTranslations].entries
    expect(entries[hashMessage(message.message)].en).toBe('current translation')
    expect(entries[currentHash].ru).toBe('another language')
    expect(entries[oldHash].en).toBe('late old translation')
    expect(hashMessage('abc' as Markup)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
