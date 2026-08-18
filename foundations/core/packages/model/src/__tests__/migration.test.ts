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

import { type MigrationClient, type MigrationUpgradeClient, tryMigrate, tryUpgrade } from '../migration'

function mockClient (applied: string[] = []): MigrationClient {
  return {
    migrateState: new Map([['test', new Set(applied)]]),
    logger: { log: jest.fn(), error: jest.fn(), close: jest.fn() },
    create: jest.fn(async () => {})
  } as unknown as MigrationClient
}

describe('tryMigrate', () => {
  it('runs a state repeated in the list only once', async () => {
    const client = mockClient()
    const func = jest.fn(async () => {})

    await tryMigrate('upgrade', client, 'test', [
      { state: 'dup', mode: 'upgrade', func },
      { state: 'dup', mode: 'upgrade', func }
    ])

    expect(func).toHaveBeenCalledTimes(1)
    expect(client.logger.error).toHaveBeenCalledWith(
      'duplicate migration states, only the first one runs',
      expect.objectContaining({ duplicates: ['dup'] })
    )
  })

  it('skips states already applied', async () => {
    const client = mockClient(['done'])
    const func = jest.fn(async () => {})

    await tryMigrate('upgrade', client, 'test', [{ state: 'done', mode: 'upgrade', func }])

    expect(func).not.toHaveBeenCalled()
  })

  it('tryUpgrade runs a state repeated in the list only once', async () => {
    const upgradeClient = {
      tx: jest.fn(async () => ({})),
      getHierarchy: () => ({ isDerived: () => false, findDomain: () => 'migration' })
    } as unknown as MigrationUpgradeClient
    const func = jest.fn(async () => {})

    await tryUpgrade('upgrade', new Map(), async () => upgradeClient, 'test', [
      { state: 'dup', mode: 'upgrade', func },
      { state: 'dup', mode: 'upgrade', func }
    ])

    expect(func).toHaveBeenCalledTimes(1)
  })

  it('re-runs a failed migration next time - the state is not persisted', async () => {
    const client = mockClient()
    const func = jest.fn(async () => {
      throw new Error('boom')
    })

    await tryMigrate('upgrade', client, 'test', [{ state: 'fails', mode: 'upgrade', func }])

    expect(client.create).not.toHaveBeenCalled()
  })
})
