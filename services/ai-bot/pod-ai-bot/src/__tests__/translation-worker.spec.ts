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

jest.mock('../config', () => ({
  __esModule: true,
  default: { AIProviders: [{ id: 'provider', concurrency: 1, batch: 1 }], LLMProviderIds: [] }
}))

/* eslint-disable import/first */
import chunter, { hashMessage } from '@hcengineering/chunter'
import { startLlmRouter } from '../queue'
/* eslint-enable import/first */

describe('translation worker', () => {
  it('does not call the provider again for a saved translation', async () => {
    const source = 'source' as any
    const sourceHash = hashMessage(source)
    const message = { message: source, [chunter.mixin.MessageTranslations]: { entries: { [sourceHash]: { en: 'saved' } } } }
    const findOne = jest.fn(async () => message)
    const translateHtml = jest.fn()
    const callbacks = new Map<string, (...args: any[]) => any>()
    const queue: any = {
      getProducer: () => ({ close: jest.fn(), send: jest.fn() }),
      createBatchConsumer: (_ctx: any, topic: string, _group: string, callback: (...args: any[]) => any) => {
        callbacks.set(topic, callback)
        return { close: jest.fn() }
      }
    }
    const aiControl = {
      getProviderIds: () => ['provider'],
      getWorkspaceClient: async () => ({ systemAccessClient: () => ({ findOne }) }),
      translateHtml
    }
    const ctx = { info: jest.fn(), error: jest.fn() }
    const boot: any = { ctx, queue, aiControl, onClose: [] }
    startLlmRouter(boot)
    await callbacks.get('llm-translate-provider')?.(ctx, [{
      workspace: 'workspace', value: { kind: 'translate', message: 'id', messageClass: 'chat', sourceHash, lang: 'en', level: 'fast' }
    }], undefined)
    expect(findOne).toHaveBeenCalledTimes(1)
    expect(translateHtml).not.toHaveBeenCalled()
    for (const close of boot.onClose) close()
  })
})
