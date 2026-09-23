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

/* eslint-disable @typescript-eslint/no-var-requires */

jest.mock('svelte/store', () => require('./svelteStoreDouble'))

jest.mock('@hcengineering/ai-bot-resources', () => {
  const { writable } = require('svelte/store')
  return { aiBotSocialIdentityStore: writable(undefined), ensureAiBotIdentityLoaded: jest.fn(async () => {}) }
})

jest.mock('@hcengineering/contact', () => ({
  getCurrentEmployee: jest.fn(() => 'person-me')
}))

jest.mock('@hcengineering/contact-resources', () => ({
  getPersonRefByPersonId: jest.fn(async () => null),
  getPersonsByPersonRefs: jest.fn(async () => new Map())
}))

const mockQueryInstances: Array<{ query: jest.Mock, unsubscribe: jest.Mock }> = []
const mockOnClientCallbacks: Array<() => void> = []

jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: { Token: 'presentation:metadata:Token' } },
  createQuery: jest.fn(() => {
    const inst = { query: jest.fn(), unsubscribe: jest.fn() }
    mockQueryInstances.push(inst)
    return inst
  }),
  onClient: jest.fn((cb: () => void) => {
    mockOnClientCallbacks.push(cb)
    cb()
  })
}))

const mockGetWorkspaceMembers = jest.fn(async () => [])

jest.mock('@hcengineering/account-client', () => ({
  getClient: jest.fn(() => ({ getWorkspaceMembers: mockGetWorkspaceMembers }))
}))

function queriedClasses (): string[] {
  return mockQueryInstances.flatMap((inst) => inst.query.mock.calls.map((c) => String(c[0])))
}

function names (classes: unknown[]): string[] {
  return classes.map(String).sort()
}

// Startup goes out as one request queue: only what the top bar and a refreshed meeting need
// is queried with the client, the rest waits for the office to be opened.
describe('office stores loaded on demand', () => {
  it('queries rooms, participants and meetings with the client, and nothing else', async () => {
    const love = (await import('../plugin')).default
    await import('../stores')

    expect(names(queriedClasses())).toEqual(
      names([love.class.Room, love.class.ParticipantInfo, love.class.MeetingMinutes])
    )
    expect(mockGetWorkspaceMembers).not.toHaveBeenCalled()
  })

  it('queries floors, preferences and recordings on the first ensureOfficeDetailsLoaded call only', async () => {
    const love = (await import('../plugin')).default
    const { ensureOfficeDetailsLoaded } = await import('../stores')

    const first = ensureOfficeDetailsLoaded()
    const second = ensureOfficeDetailsLoaded()
    for (const inst of mockQueryInstances) {
      for (const call of inst.query.mock.calls) {
        // Answer every live query so the promises settle.
        ;(call[2] as (res: unknown[]) => void)([])
      }
    }
    await Promise.all([first, second])

    const details = names([love.class.Floor, love.class.DevicesPreference, love.class.PendingRecording])
    const detailClasses = queriedClasses().filter((it) => details.includes(it))
    expect(names(detailClasses)).toEqual(details)
  })

  it('does not re-issue the detail queries when the client is set again', async () => {
    // Global queries follow the new client by themselves; a second query() with the same arguments
    // would not call back, and the loader promise would never settle.
    const love = (await import('../plugin')).default
    await import('../stores')
    const floor = String(love.class.Floor)
    const before = queriedClasses().filter((it) => it === floor).length

    for (const cb of mockOnClientCallbacks) cb()

    expect(queriedClasses().filter((it) => it === floor).length).toBe(before)
  })

  it('fetches the workspace members on the first ensureWorkspaceMembersLoaded call only', async () => {
    const { ensureWorkspaceMembersLoaded } = await import('../stores')

    await Promise.all([ensureWorkspaceMembersLoaded(), ensureWorkspaceMembersLoaded()])

    expect(mockGetWorkspaceMembers).toHaveBeenCalledTimes(1)
  })
})
