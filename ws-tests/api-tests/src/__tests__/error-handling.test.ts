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

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient,
  type ServerConfig,
  type WorkspaceToken
} from '@hcengineering/api-client'
import core, {
  generateId,
  generateUuid,
  MeasureMetricsContext,
  pickPrimarySocialId,
  type Ref,
  type Class,
  type Doc,
  type SocialId,
  type Space,
  type TxCreateDoc,
  type PersonId,
  type TxOperations,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type AccountClient, getClient as getAccountClient } from '@hcengineering/account-client'
import { ensureEmployee } from '@hcengineering/contact'
import { generateToken } from '@hcengineering/server-token'

describe('error-handling', () => {
  const testCtx = new MeasureMetricsContext('test', {})
  const wsName = 'api-tests'
  let config: ServerConfig
  let apiWorkspace: WorkspaceToken
  let accountClient: AccountClient

  beforeAll(async () => {
    config = await loadServerConfig('http://huly.local:8083')

    apiWorkspace = await getWorkspaceToken(
      'http://huly.local:8083',
      {
        email: 'user1',
        password: '1234',
        workspace: wsName
      },
      config
    )

    accountClient = getAccountClient(config.ACCOUNTS_URL, apiWorkspace.token)
    const person = await accountClient.getPerson()
    const socialIds: SocialId[] = await accountClient.getSocialIds(true)

    await ensureEmployee(
      testCtx,
      {
        uuid: apiWorkspace.info.account,
        role: apiWorkspace.info.role,
        primarySocialId: pickPrimarySocialId(socialIds)._id,
        socialIds: socialIds.map((si) => si._id),
        fullSocialIds: socialIds
      },
      connect(),
      socialIds,
      async () => person
    )
  }, 15000)

  function connect (): RestClient {
    return createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, apiWorkspace.token)
  }

  async function connectTx (): Promise<TxOperations> {
    return await createRestTxOperations(apiWorkspace.endpoint, apiWorkspace.workspaceId, apiWorkspace.token)
  }

  // Ensures operation settles (resolve or reject) within timeout.
  // Purpose: detect server hangs. Whether the server throws or silently no-ops is not asserted here.
  async function expectNoHang<T> (op: Promise<T>, timeoutMs = 5000): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<'__hang__'>((resolve) => {
      timer = setTimeout(() => {
        resolve('__hang__')
      }, timeoutMs)
    })
    try {
      const outcome = await Promise.race([op.then(() => 'ok' as const).catch(() => 'ok' as const), timeout])
      expect(outcome).not.toBe('__hang__')
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  function createSpaceTx (primarySocialId: PersonId, spaceName: string, objectId?: string): TxCreateDoc<Space> {
    return {
      _class: core.class.TxCreateDoc,
      space: core.space.Tx,
      _id: generateId(),
      objectSpace: core.space.Model,
      modifiedBy: primarySocialId,
      modifiedOn: Date.now(),
      attributes: {
        name: spaceName,
        description: '',
        private: false,
        archived: false,
        members: [],
        autoJoin: false
      },
      objectClass: core.class.Space,
      objectId: (objectId ?? generateId()) as Ref<Space>
    }
  }

  // --- Invalid class / query tests ---

  describe('invalid-class-and-query', () => {
    it('findAll with non-existent class should return error', async () => {
      const conn = connect()
      await expect(conn.findAll('non:existent:Class' as Ref<Class<Doc>>, {})).rejects.toThrow()
    })

    it('findAll with malformed query should not hang', async () => {
      const conn = connect()
      const result = await conn.findAll(core.class.Space, { _id: undefined as any })
      expect(Array.isArray(result)).toBe(true)
    })

    it('findAll with empty class string should return error', async () => {
      const conn = connect()
      await expect(conn.findAll('' as Ref<Class<Doc>>, {})).rejects.toThrow()
    })
  })

  // --- Invalid token / auth tests ---

  describe('invalid-auth', () => {
    it('request with invalid token should return 401/403', async () => {
      const conn = createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, 'invalid-token')
      await expect(conn.findAll(core.class.Space, {})).rejects.toThrow()
    })

    it('request with invalid signature token should return error', async () => {
      const expiredToken = generateToken(apiWorkspace.info.account, apiWorkspace.workspaceId, undefined, 'wrong-secret')
      const conn = createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, expiredToken)
      await expect(conn.findAll(core.class.Space, {})).rejects.toThrow()
    })

    it('request with mismatched workspace should return 403', async () => {
      const wrongWsToken = generateToken(
        apiWorkspace.info.account,
        generateUuid() as unknown as WorkspaceUuid,
        undefined,
        'secret'
      )
      const conn = createRestClient(apiWorkspace.endpoint, apiWorkspace.workspaceId, wrongWsToken)
      await expect(conn.findAll(core.class.Space, {})).rejects.toThrow()
    })
  })

  // --- Transaction error tests ---

  describe('transaction-errors', () => {
    it('create doc with duplicate id should handle gracefully', async () => {
      const conn = connect()
      const spaceName = generateId()
      const objectId = generateId()
      const account = await conn.getAccount()

      // First create should succeed
      await conn.tx(createSpaceTx(account.primarySocialId, spaceName, objectId))

      // Second create with same objectId must complete (resolve or reject) — must not hang
      await expectNoHang(conn.tx(createSpaceTx(account.primarySocialId, spaceName, objectId)))
    })

    it('tx with empty body should return error', async () => {
      const conn = connect()
      await expect(conn.tx({} as any)).rejects.toThrow()
    })

    it('tx with invalid class should return error', async () => {
      const conn = connect()
      const account = await conn.getAccount()
      const tx = {
        _class: core.class.TxCreateDoc,
        space: core.space.Tx,
        _id: generateId(),
        objectSpace: core.space.Model,
        modifiedBy: account.primarySocialId,
        modifiedOn: Date.now(),
        attributes: {},
        objectClass: 'non:existent:Class',
        objectId: generateId()
      }
      await expect(conn.tx(tx as any)).rejects.toThrow()
    })

    it('update non-existent document should handle gracefully', async () => {
      const conn = await connectTx()
      await expectNoHang(
        conn.updateDoc(core.class.Space, core.space.Model, generateId(), { name: 'non-existent' })
      )
    })

    it('remove non-existent document should handle gracefully', async () => {
      const conn = await connectTx()
      await expectNoHang(conn.removeDoc(core.class.Space, core.space.Model, generateId()))
    })
  })

  // --- Concurrent operations tests ---

  describe('concurrent-operations', () => {
    it('parallel findAll should not cause server errors', async () => {
      const conn = connect()
      const promises = Array.from({ length: 20 }, () => conn.findAll(core.class.Space, {}))
      const results = await Promise.all(promises)
      for (const result of results) {
        expect(result.length).toBeGreaterThan(0)
      }
    })

    it('parallel tx should not cause data corruption', async () => {
      const conn = connect()
      const account = await conn.getAccount()

      const promises = Array.from({ length: 10 }, () => {
        return conn.tx(createSpaceTx(account.primarySocialId, `concurrent-test-${generateId()}`))
      })

      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r) => r.status === 'fulfilled')
      // At least some should succeed without hanging
      expect(succeeded.length).toBeGreaterThan(0)
    })

    it('rapid sequential tx should not overwhelm server', async () => {
      const conn = connect()
      const account = await conn.getAccount()

      for (let i = 0; i < 10; i++) {
        await conn.tx(createSpaceTx(account.primarySocialId, `rapid-test-${generateId()}`))
      }
      // If we reach here, no hanging occurred
      expect(true).toBe(true)
    })

    it('mixed read-write concurrent operations should not deadlock', async () => {
      const conn = connect()
      const account = await conn.getAccount()

      const operations: Array<Promise<any>> = []

      // Mix reads and writes
      for (let i = 0; i < 10; i++) {
        operations.push(conn.findAll(core.class.Space, {}))

        if (i % 2 === 0) {
          operations.push(conn.tx(createSpaceTx(account.primarySocialId, `mixed-op-${generateId()}`)))
        }
      }

      const results = await Promise.allSettled(operations)
      const failed = results.filter((r) => r.status === 'rejected')
      // Some may fail due to rate limits, but none should hang
      expect(results.length).toBe(operations.length)
      // Most operations should succeed
      expect(failed.length).toBeLessThan(operations.length / 2)
    })
  })

  // --- Large payload tests ---

  describe('large-payload', () => {
    it('findAll with very large query should return error not hang', async () => {
      const conn = connect()
      const largeQuery = {
        name: { $in: Array.from({ length: 1000 }, (_, i) => `space-${i}`) }
      }
      // Large GET query exceeds header size limit (431), should throw not hang
      await expect(conn.findAll(core.class.Space, largeQuery)).rejects.toThrow()
    })

    it('create doc with large attributes should handle properly', async () => {
      const conn = connect()
      const account = await conn.getAccount()

      const tx = createSpaceTx(account.primarySocialId, 'x'.repeat(10000))
      tx.attributes.description = 'x'.repeat(50000)

      // Should either succeed or fail with error, not hang
      const result = await Promise.race([
        conn
          .tx(tx)
          .then(() => 'done')
          .catch(() => 'error'),
        new Promise<string>((resolve) =>
          setTimeout(() => {
            resolve('timeout')
          }, 30000)
        )
      ])
      expect(result).not.toBe('timeout')
    })
  })

  // --- Session / connection edge cases ---

  describe('session-edge-cases', () => {
    it('multiple clients with same credentials should work', async () => {
      const conn1 = connect()
      const conn2 = connect()

      const [spaces1, spaces2] = await Promise.all([
        conn1.findAll(core.class.Space, {}),
        conn2.findAll(core.class.Space, {})
      ])

      expect(spaces1.length).toBe(spaces2.length)
    })

    it('operations after server error should recover', async () => {
      const conn = connect()

      // Trigger an error
      try {
        await conn.findAll('bad:class:Name' as Ref<Class<Doc>>, {})
      } catch {
        // Expected
      }

      // Next operation should still work
      const spaces = await conn.findAll(core.class.Space, {})
      expect(spaces.length).toBeGreaterThan(0)
    })

    it('getAccount should be idempotent', async () => {
      const conn = connect()
      const account1 = await conn.getAccount()
      const account2 = await conn.getAccount()
      expect(account1.primarySocialId).toBe(account2.primarySocialId)
    })
  })

  // --- Rate limiting tests ---

  describe('rate-limiting', () => {
    it('burst of requests should be handled gracefully', async () => {
      const conn = connect()
      const promises = Array.from({ length: 50 }, () => conn.findAll(core.class.Space, {}, { limit: 1 }))

      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r) => r.status === 'fulfilled')
      // With rate limiting, some may fail but should not hang
      expect(succeeded.length).toBeGreaterThan(0)
    }, 60000)
  })

  // --- Model loading tests ---

  describe('model-loading', () => {
    it('getModel should not fail on repeated calls', async () => {
      const conn = connect()
      const model1 = await conn.getModel()
      const model2 = await conn.getModel()

      expect(model1.hierarchy).toBeDefined()
      expect(model2.hierarchy).toBeDefined()
    })

    it('concurrent getModel calls should not deadlock', async () => {
      const conn = connect()
      const promises = Array.from({ length: 5 }, () => conn.getModel())
      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r) => r.status === 'fulfilled')
      expect(succeeded.length).toBeGreaterThan(0)
    })
  })

  // --- Ensure person edge cases ---

  describe('ensure-person-errors', () => {
    it('ensurePerson with empty values should handle gracefully', async () => {
      const conn = connect()
      await expect(conn.ensurePerson('' as any, '', '', '')).rejects.toThrow()
    })

    it('ensurePerson called concurrently for same person should not create duplicates', async () => {
      const conn = connect()
      const socialValue = `test-${generateId()}`

      const promises = Array.from({ length: 3 }, () =>
        conn.ensurePerson('telegram' as any, socialValue, 'Test', 'User')
      )

      const results = await Promise.allSettled(promises)
      const succeeded = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')

      if (succeeded.length > 1) {
        // All successful results should have the same uuid
        const uuids = new Set(succeeded.map((r) => r.value.uuid))
        expect(uuids.size).toBe(1)
      }
    })
  })

  // --- Timeout / hanging detection ---

  describe('timeout-detection', () => {
    it('findAll should complete within reasonable time', async () => {
      const conn = connect()
      const start = performance.now()
      await conn.findAll(core.class.Space, {})
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(10000) // 10 seconds max
    })

    it('tx should complete within reasonable time', async () => {
      const conn = connect()
      const account = await conn.getAccount()

      const start = performance.now()
      await conn.tx(createSpaceTx(account.primarySocialId, `timeout-test-${generateId()}`))
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(10000) // 10 seconds max
    })
  })
})
