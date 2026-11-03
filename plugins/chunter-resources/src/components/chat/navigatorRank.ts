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
import { type Chat } from '@hcengineering/chunter'
import { type DocumentUpdate, type Rank } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'

import { type ChatNavEntry } from './types'

export interface ChatRankUpdate {
  chat: Chat
  rank: Rank
}

// A rank orders the section the chat leaves: in the new one it goes with the unranked
export function getPinUpdate (pinned: boolean): DocumentUpdate<Chat> {
  return { pinned, $unset: { rank: true } }
}

// Only listed chats move: not a found person without a direct, nor an open archived chat added to the end
export function getMovableChat ({ preview, chat }: ChatNavEntry): Chat | undefined {
  return preview.archived ? undefined : chat
}

// Dropping on the chat itself or next to it on its own side changes nothing
export function isSamePlace (chats: Chat[], moving: Chat, target: Chat, after: boolean): boolean {
  const ids = chats.map((it) => it._id)
  const from = ids.indexOf(moving._id)
  const to = ids.indexOf(target._id)
  return to === from || to === (after ? from - 1 : from + 1)
}

function isAbove (rank: Rank | undefined, last: Rank | undefined): rank is Rank {
  return rank != null && (last == null || rank > last)
}

// Moves made at once in two tabs may give equal ranks: those get new ones too
export function getMoveRanks (chats: Chat[], moving: Chat, target: Chat, after: boolean): ChatRankUpdate[] {
  const rest = chats.filter((it) => it._id !== moving._id)
  const targetIndex = rest.findIndex((it) => it._id === target._id)
  if (targetIndex < 0) return []
  const index = after ? targetIndex + 1 : targetIndex
  const order = [...rest.slice(0, index), moving, ...rest.slice(index)]

  const updates: ChatRankUpdate[] = []
  let last: Rank | undefined
  for (let i = 0; i < order.length; i++) {
    const chat = order[i]
    if (chat !== moving && isAbove(chat.rank, last)) {
      last = chat.rank
      continue
    }
    // Unranked chats below the dropped one stay last
    if (i > index && chat.rank == null) break
    const prev = last
    const next = order.slice(i + 1).find((it) => it !== moving && isAbove(it.rank, prev))?.rank
    last = makeRank(prev, next)
    updates.push({ chat, rank: last })
  }
  return updates
}
