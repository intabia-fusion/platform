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
import { type DocPreview, type Rank, type Ref, TxProcessor } from '@hcengineering/core'
import { genRanks } from '@hcengineering/rank'

import { getMovableChat, getMoveRanks, getPinUpdate, isSamePlace } from '../components/chat/navigatorRank'

function chat (id: string, rank?: Rank): Chat {
  return { _id: id as Ref<Chat>, rank } as unknown as Chat
}

function compareRanks (a: Chat, b: Chat): number {
  const [x, y] = [a.rank as string, b.rank as string]
  return x < y ? -1 : x > y ? 1 : 0
}

// The order the query gives: by rank, unranked last
function sorted (chats: Chat[]): string[] {
  const ranked = chats.filter((it) => it.rank != null).sort(compareRanks)
  return [...ranked, ...chats.filter((it) => it.rank == null)].map((it) => it._id)
}

function move (chats: Chat[], moving: string, target: string, after: boolean): string[] {
  const byId = new Map(chats.map((it) => [it._id as string, it]))
  const updates = getMoveRanks(chats, byId.get(moving) as Chat, byId.get(target) as Chat, after)
  const ranks = new Map(updates.map((it) => [it.chat._id, it.rank]))
  return sorted(chats.map((it) => chat(it._id, ranks.get(it._id) ?? it.rank)))
}

describe('getMoveRanks', () => {
  const [r1, r2, r3] = genRanks(3)

  it('moves among ranked chats with one update', () => {
    const chats = [chat('a', r1), chat('b', r2), chat('c', r3)]
    expect(move(chats, 'c', 'a', false)).toEqual(['c', 'a', 'b'])
    expect(move(chats, 'a', 'b', true)).toEqual(['b', 'a', 'c'])
    expect(move(chats, 'a', 'c', true)).toEqual(['b', 'c', 'a'])
    expect(getMoveRanks(chats, chats[2], chats[0], false)).toHaveLength(1)
  })

  it('ranks only the moved chat when all are unranked and it goes first', () => {
    const chats = [chat('a'), chat('b'), chat('c')]
    const updates = getMoveRanks(chats, chats[2], chats[0], false)
    expect(updates.map((it) => it.chat._id)).toEqual(['c'])
    expect(move(chats, 'c', 'a', false)).toEqual(['c', 'a', 'b'])
  })

  it('ranks the unranked chats above a drop into the unranked tail', () => {
    const chats = [chat('a', r1), chat('b'), chat('c'), chat('d')]
    const updates = getMoveRanks(chats, chats[0], chats[2], true)
    expect(updates.map((it) => it.chat._id)).toEqual(['b', 'c', 'a'])
    expect(move(chats, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('puts a chat between neighbours of equal rank', () => {
    const chats = [chat('a', r2), chat('b', r2), chat('c', r3)]
    expect(move(chats, 'c', 'a', true)).toEqual(['a', 'c', 'b'])
  })

  it('does nothing for a target outside the list', () => {
    const chats = [chat('a', r1), chat('b', r2)]
    expect(getMoveRanks(chats, chats[0], chat('x', r3), false)).toEqual([])
  })
})

describe('isSamePlace', () => {
  const chats = [chat('a'), chat('b'), chat('c')]
  const [a, b, c] = chats

  it('is true for the chat itself and the neighbour edge on its own side', () => {
    expect(isSamePlace(chats, b, b, false)).toBe(true)
    expect(isSamePlace(chats, b, b, true)).toBe(true)
    expect(isSamePlace(chats, b, a, true)).toBe(true)
    expect(isSamePlace(chats, b, c, false)).toBe(true)
  })

  it('is false for a real move', () => {
    expect(isSamePlace(chats, b, a, false)).toBe(false)
    expect(isSamePlace(chats, b, c, true)).toBe(false)
    expect(isSamePlace(chats, a, c, false)).toBe(false)
  })
})

describe('getMovableChat', () => {
  const listed = chat('a')

  it('moves a listed chat only', () => {
    expect(getMovableChat({ preview: {} as unknown as DocPreview, chat: listed })).toBe(listed)
    expect(getMovableChat({ preview: { archived: true } as unknown as DocPreview, chat: listed })).toBeUndefined()
    expect(getMovableChat({ preview: {} as unknown as DocPreview })).toBeUndefined()
  })
})

describe('getPinUpdate', () => {
  it('drops the rank on star and unstar', () => {
    const [r1] = genRanks(1)
    for (const pinned of [true, false]) {
      const res = { ...chat('a', r1), pinned: !pinned }
      TxProcessor.applyUpdate(res, getPinUpdate(pinned))
      expect(res.pinned).toBe(pinned)
      expect(res.rank).toBeUndefined()
    }
  })
})
