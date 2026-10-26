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

import { type Doc } from '@hcengineering/core'

// Applets of one message come in one apply, often at the same millisecond: the id keeps the order of creation.
export function sortApplets<T extends Pick<Doc, '_id' | 'createdOn'>> (applets: T[]): T[] {
  return [...applets].sort((a, b) => {
    const byTime = (a.createdOn ?? 0) - (b.createdOn ?? 0)
    if (byTime !== 0) return byTime
    return a._id < b._id ? -1 : a._id > b._id ? 1 : 0
  })
}
