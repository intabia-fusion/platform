/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/
import gmail from '@hcengineering/gmail'
import { IsIncomingMessageTypeMatch } from '../index'

describe('IsIncomingMessageTypeMatch', () => {
  const client: any = {
    ctx: {},
    hierarchy: { isDerived: () => true },
    findAll: jest.fn(async () => [{ incoming: true, sendOn: 2 }])
  }
  const doc: any = { createdOn: 1 }

  it('matches creation of an incoming message', async () => {
    const message: any = { objectClass: gmail.class.Message, objectId: 'm1', action: 'create' }
    expect(await IsIncomingMessageTypeMatch(client, {} as any, message, doc, {} as any)).toBe(true)
  })

  it('does not match an update of an incoming message', async () => {
    const message: any = { objectClass: gmail.class.Message, objectId: 'm1', action: 'update' }
    expect(await IsIncomingMessageTypeMatch(client, {} as any, message, doc, {} as any)).toBe(false)
  })
})
