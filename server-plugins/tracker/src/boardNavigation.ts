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

import type { Ref, Tx, WorkspaceUuid } from '@hcengineering/core'

const pending = new Map<string, Promise<void>>()

export function boardBeforeKey (tx: Ref<Tx>): string {
  return `tracker:board-before:${tx}`
}

// Shared by first-open client writes and server assignments, which bypass ApplyTxMiddleware.
// Derived writes re-enter BoardMiddleware with the same root context cache.
export async function withBoardNavigationLock<T> (
  workspace: WorkspaceUuid,
  id: string,
  contextCache: Map<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  const key = `tracker:board-navigation-lock:${workspace}:${id}`
  if (contextCache.get(key) === true) return await fn()
  const previous = pending.get(key)
  let release = (): void => {}
  const current = new Promise<void>((resolve) => { release = resolve })
  pending.set(key, current)
  await previous
  contextCache.set(key, true)
  try {
    return await fn()
  } finally {
    contextCache.delete(key)
    if (pending.get(key) === current) pending.delete(key)
    release()
  }
}
