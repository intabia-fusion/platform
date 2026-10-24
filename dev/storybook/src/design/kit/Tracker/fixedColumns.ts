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

import { getContext, setContext } from 'svelte'
import { writable, type Writable } from 'svelte/store'

const KEY = Symbol('kit-fixed-columns')

// Widest cell per column key, shared by every row below the nearest provider (live: fixedWidthStore of view-resources)
export function fixedColumns (): Writable<Record<string, number>> {
  const own = getContext<Writable<Record<string, number>> | undefined>(KEY)
  if (own !== undefined) return own
  const store = writable<Record<string, number>>({})
  setContext(KEY, store)
  return store
}
