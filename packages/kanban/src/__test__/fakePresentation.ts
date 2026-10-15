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

import { vi } from 'vitest'

export interface FakeCall {
  owner: FakeLiveQuery
  cls: unknown
  query: any
  callback: (docs: any[]) => void
  options: unknown
  resolved: boolean
}

// Records every query() of every LiveQuery; the test answers them by hand.
export class FakeLiveQuery {
  closed = false
  last: FakeCall | undefined

  query (cls: unknown, query: any, callback: (docs: any[]) => void, options?: unknown): boolean {
    this.closed = false
    this.last = { owner: this, cls, query, callback, options, resolved: false }
    fakeQueries.calls.push(this.last)
    return true
  }

  unsubscribe (): void {
    this.closed = true
  }
}

export const fakeQueries: { calls: FakeCall[] } = { calls: [] }

export const fakeClient = {
  update: vi.fn(async (_doc: any, _update: any) => ({})),
  diffUpdate: vi.fn(async (_doc: any, _update: any) => ({}))
}

export const createQuery = (): FakeLiveQuery => new FakeLiveQuery()
export const getClient = (): typeof fakeClient => fakeClient
