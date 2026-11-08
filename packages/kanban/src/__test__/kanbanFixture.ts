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

import type { Ref } from '@hcengineering/core'
import type { KanbanInputs } from '../kanbanController'
import type { Item } from '../types'
import { fakeClient } from './fakePresentation'
import { stateKey } from '../visibleGroups'

export function controllerFixture (columns: number, cardsPerColumn: number): KanbanInputs {
  const categories = Array.from({ length: columns }, (_, index) => `column${index}`)
  const groupByDocs: Record<string, Item[]> = Object.fromEntries(
    categories.map((state) => [
      state,
      Array.from(
        { length: cardsPerColumn },
        (_, index) =>
          ({
            _id: `${state}-${index}` as Ref<Item>,
            status: state,
            rank: String(index).padStart(6, '0')
          }) as unknown as Item
      )
    ])
  )
  return {
    columnStorageKey: undefined,
    categories,
    fitColumns: false,
    getCategoryGroup: undefined,
    groupByDocs,
    getGroupByValues: (groups, state) => groups[stateKey(state)],
    setGroupByValues: (groups, state, docs) => {
      groups[stateKey(state)] = docs
    },
    storageKey: undefined,
    swimLanes: [],
    getSwimLaneOfDoc: undefined,
    getSwimLaneDocId: undefined,
    getSwimLaneUpdateProps: undefined,
    getUpdateProps: (_doc, state) => ({ status: state }) as any,
    dontUpdateRank: false,
    swimLaneMode: false,
    onMoveCommit: undefined,
    dispatch: () => true,
    client: fakeClient as unknown as KanbanInputs['client'],
    onMoveRollback: undefined,
    scrollerEl: undefined,
    orderBy: undefined,
    getAvailableCategories: undefined,
    swimRowBindings: {},
    stateRefs: [],
    stateRows: [],
    shownSwimLanes: [],
    objects: Object.values(groupByDocs).flat(),
    selection: undefined,
    checkedSet: new Set(),
    checked: []
  }
}
