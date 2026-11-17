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
import { type Chat, type ChatNavSort } from '@hcengineering/chunter'
import core, { type SortingQuery, SortingOrder } from '@hcengineering/core'
import { createQuery, getClient, onWorkspaceChange } from '@hcengineering/presentation'
import type { Asset, IntlString } from '@hcengineering/platform'
import ui, { type Action, SelectPopup, type SelectPopupValueType } from '@hcengineering/ui'
import { type Readable, writable } from 'svelte/store'

import chunter from '../../plugin'
import { getMoveRanks } from './navigatorRank'

const query = createQuery(true)

const sorts = writable<Record<string, ChatNavSort> | undefined>(undefined, (set) => {
  query.query(
    chunter.class.ChatNavSortPreference,
    {},
    (res) => {
      set(Object.fromEntries(res.map((it) => [it.attachedTo, it.sort])))
    },
    { sort: { modifiedOn: SortingOrder.Ascending } }
  )
  return () => {
    query.unsubscribe()
  }
})

onWorkspaceChange(() => {
  sorts.set(undefined)
})

export const chatNavSortStore: Readable<Record<string, ChatNavSort> | undefined> = { subscribe: sorts.subscribe }

let pendingSort: Promise<void> = Promise.resolve()

// One write at a time, so quick picks do not each create a document
export async function setChatNavSort (sectionId: string, sort: ChatNavSort): Promise<void> {
  pendingSort = pendingSort
    .catch(() => {})
    .then(async () => {
      await writeChatNavSort(sectionId, sort)
    })
  await pendingSort
}

async function writeChatNavSort (sectionId: string, sort: ChatNavSort): Promise<void> {
  const client = getClient()
  const [current, ...extra] = await client.findAll(
    chunter.class.ChatNavSortPreference,
    { attachedTo: sectionId },
    { sort: { modifiedOn: SortingOrder.Descending } }
  )
  for (const it of extra) {
    await client.remove(it)
  }
  if (current == null) {
    await client.createDoc(chunter.class.ChatNavSortPreference, core.space.Workspace, { attachedTo: sectionId, sort })
  } else if (current.sort !== sort) {
    await client.update(current, { sort })
  }
}

export function getChatNavQuerySort (sort: ChatNavSort): SortingQuery<Chat> {
  switch (sort) {
    case 'name':
      return { '$lookup.preview.title': SortingOrder.Ascending }
    case 'rank':
      return { rank: SortingOrder.Ascending }
    default:
      return { '$lookup.readState.latestMessageTimestamp': SortingOrder.Descending }
  }
}

export function getChatNavSortAction (sectionId: string, current: ChatNavSort, manual: boolean): Action {
  const option = (id: ChatNavSort, label: IntlString, icon: Asset): SelectPopupValueType => ({
    id,
    label,
    icon,
    isSelected: current === id
  })
  return {
    icon: ui.icon.ArrowUpLines,
    label: chunter.string.NavSort,
    group: 'sort',
    component: SelectPopup,
    props: {
      value: [
        option('lastMessage', chunter.string.NavSortByLastMessage, ui.icon.Clock),
        option('name', chunter.string.NavSortByName, ui.icon.TextAa),
        ...(manual ? [option('rank', chunter.string.NavSortManual, ui.icon.GripVertical)] : [])
      ],
      size: 'small'
    },
    action: async () => {},
    onSubmenuResult: async (sort: ChatNavSort) => {
      await setChatNavSort(sectionId, sort)
    }
  }
}

export async function moveChat (chats: Chat[], moving: Chat, target: Chat, after: boolean): Promise<void> {
  const updates = getMoveRanks(chats, moving, target, after)
  if (updates.length === 0) return
  const client = getClient()
  const ops = client.apply(undefined, 'chatNavRank')
  try {
    for (const { chat, rank } of updates) {
      await ops.updateCollection(chat._class, chat.space, chat._id, chat.attachedTo, chat.attachedToClass, 'chats', {
        rank
      })
    }
  } finally {
    await ops.commit()
  }
}
