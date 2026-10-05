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
import core from '@hcengineering/core'
import request from '@hcengineering/request'
import { OnRequest } from '../index'

describe('OnRequest', () => {
  it('ignores an approval of a request that no longer exists', async () => {
    const control: any = {
      ctx: {},
      hierarchy: { isDerived: () => true },
      findAll: jest.fn(async () => []),
      txFactory: { createTxUpdateDoc: jest.fn(() => ({})), createTxCollectionCUD: jest.fn(() => ({})) },
      apply: jest.fn()
    }
    const tx: any = {
      _class: core.class.TxUpdateDoc,
      objectClass: request.class.Request,
      objectId: 'r1',
      operations: { $push: { approved: 'u1' } }
    }
    await expect(OnRequest([tx], control)).resolves.toEqual([])
  })
})
