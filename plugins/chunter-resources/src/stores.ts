//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { writable } from 'svelte/store'
import { type ChatMessage } from '@hcengineering/chunter'
import { type Doc, type Markup, type Ref } from '@hcengineering/core'
import { languageStore } from '@hcengineering/ui'
import { type ActivityMessage } from '@hcengineering/activity'

export const translatingMessagesStore = writable<Set<Ref<ChatMessage>>>(new Set())
export const translatedMessagesStore = writable<Map<Ref<ChatMessage>, Markup>>(new Map())
export const shownTranslatedMessagesStore = writable<Set<Ref<ChatMessage>>>(new Set())

/**
 * Meetings whose summary this user asked for and is still waiting on. The request only queues the
 * job, so the spinner is feedback on the click: it is per-tab and never leaves for other viewers.
 */
export const summarizingStore = writable<Set<Ref<Doc>>>(new Set())

/** Give up on the spinner when nothing arrives - a failed pod would otherwise spin forever. */
const SUMMARY_TIMEOUT_MS = 3 * 60 * 1000

export function startSummarizing (doc: Ref<Doc>): void {
  summarizingStore.update((store) => new Set(store).add(doc))
  setTimeout(() => {
    stopSummarizing(doc)
  }, SUMMARY_TIMEOUT_MS)
}

export function stopSummarizing (doc: Ref<Doc>): void {
  summarizingStore.update((store) => {
    if (!store.has(doc)) return store
    const next = new Set(store)
    next.delete(doc)
    return next
  })
}

export const threadMessagesStore = writable<ActivityMessage | undefined>(undefined)

export const replyingToMessageStore = writable<ChatMessage | undefined>(undefined)

languageStore.subscribe(() => {
  translatedMessagesStore.set(new Map())
  shownTranslatedMessagesStore.set(new Set())
})
