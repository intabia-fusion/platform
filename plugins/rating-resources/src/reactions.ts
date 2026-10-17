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

import core, { getCurrentAccount, type Doc } from '@hcengineering/core'
import { isCustomEmoji } from '@hcengineering/emoji'
import { EmojiPopup, getFrequentlyEmojis } from '@hcengineering/emoji-resources'
import { getClient } from '@hcengineering/presentation'
import ratingPlugin, { ReactionKind, type DocReaction } from '@hcengineering/rating'
import { showPopup, type PopupAlignment } from '@hcengineering/ui'

export interface ReactionEmoji {
  text?: string
  image?: any
}

type ReactionTarget = Pick<Doc, '_id' | '_class'>

function isMine (reaction: DocReaction): boolean {
  return getCurrentAccount().fullSocialIds.some((it) => it._id === reaction.modifiedBy)
}

async function loadReactions (doc: ReactionTarget): Promise<DocReaction[]> {
  return await getClient().findAll(ratingPlugin.class.DocReaction, { attachedTo: doc._id, attachedToClass: doc._class })
}

export function hasMyStar (reactions: DocReaction[]): boolean {
  const socialIds = new Set(getCurrentAccount().fullSocialIds.map((it) => it._id))
  return reactions.some(
    (it) => it.reactionType === ReactionKind.Star && socialIds.has(it.createdBy ?? it.modifiedBy) && it.value === 1
  )
}

// Pass the reactions already loaded by the caller to skip the query.
export async function toggleStar (doc: ReactionTarget, known?: DocReaction[]): Promise<void> {
  const client = getClient()
  const reactions = known ?? (await loadReactions(doc))
  const existing = reactions.filter((it) => it.reactionType === ReactionKind.Star && isMine(it))
  if (existing.length === 0) {
    await client.addCollection(
      ratingPlugin.class.DocReaction,
      core.space.Workspace,
      doc._id,
      doc._class,
      '_reactions',
      {
        reactionType: ReactionKind.Star,
        value: 1
      }
    )
    return
  }
  for (const e of existing) {
    await client.update(e, { value: e.value === 0 ? 1 : 0 })
  }
}

export async function toggleEmoji (doc: ReactionTarget, emoji: ReactionEmoji, known?: DocReaction[]): Promise<void> {
  if (emoji.text === undefined) return
  const client = getClient()
  const reactions = known ?? (await loadReactions(doc))
  const existing = reactions.filter(
    (it) => it.reactionType === ReactionKind.Emoji && it.emoji === emoji.text && isMine(it)
  )
  if (existing.length === 0) {
    await client.addCollection(
      ratingPlugin.class.DocReaction,
      core.space.Workspace,
      doc._id,
      doc._class,
      '_reactions',
      {
        reactionType: ReactionKind.Emoji,
        value: 0,
        emoji: emoji.text,
        image: emoji.image
      }
    )
    return
  }
  for (const e of existing) {
    await client.remove(e)
  }
}

const defaultQuickEmoji = ['👍', '✅', '🎉', '👀', '🔥', '❤️']

export interface QuickReaction extends ReactionEmoji {
  text: string
  count: number
  mine: boolean
}

// The same emoji comes with or without the variation selector depending on the source.
function emojiKey (text: string): string {
  return text.replace(/\uFE0F/g, '')
}

// Emoji already on the document come first, then the user's frequent ones and defaults, up to six in total.
export function getQuickReactions (reactions: DocReaction[]): QuickReaction[] {
  const result = new Map<string, QuickReaction>()
  for (const r of reactions) {
    if (r.reactionType !== ReactionKind.Emoji || r.emoji === undefined) continue
    const key = emojiKey(r.emoji)
    const item = result.get(key) ?? { text: r.emoji, image: r.image, count: 0, mine: false }
    item.count++
    item.mine = item.mine || isMine(r)
    result.set(key, item)
  }
  const frequent = (getFrequentlyEmojis() ?? []).map((it) => (isCustomEmoji(it) ? undefined : it.emoji))
  for (const text of [...frequent, ...defaultQuickEmoji]) {
    if (result.size >= 6) break
    if (text !== undefined && !result.has(emojiKey(text))) result.set(emojiKey(text), { text, count: 0, mine: false })
  }
  return [...result.values()]
}

export function openEmojiPopup (
  doc: ReactionTarget,
  reactions: DocReaction[] | undefined,
  alignment: PopupAlignment,
  onClose?: () => void
): void {
  showPopup(EmojiPopup, { selected: undefined }, alignment, (emoji: ReactionEmoji | undefined) => {
    onClose?.()
    if (emoji !== undefined) void toggleEmoji(doc, emoji, reactions)
  })
}

// Menu entries of a narrow panel, which has no room for the header buttons.
export async function toggleStarAction (doc: Doc | Doc[]): Promise<void> {
  if (!Array.isArray(doc)) await toggleStar(doc)
}

// The menu item is gone by the time the popup opens, so it is not anchored.
export async function addEmojiAction (doc: Doc | Doc[]): Promise<void> {
  if (!Array.isArray(doc)) openEmojiPopup(doc, undefined, 'top')
}
