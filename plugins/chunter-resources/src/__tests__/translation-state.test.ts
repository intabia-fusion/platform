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

jest.mock('@hcengineering/ui', () => ({ languageStore: jest.requireActual('svelte/store').writable('en') }))
jest.mock('@hcengineering/presentation', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/notification-resources', () => ({ NotificationClientImpl: {} }))

/* eslint-disable import/first */
import { type ChatMessage } from '@hcengineering/chunter'
import { type Ref } from '@hcengineering/core'
import { get } from 'svelte/store'
import { failTranslating, isTranslationAttempt, shownTranslatedMessagesStore, startTranslating, stopTranslating, translatingMessagesStore } from '../stores'
/* eslint-enable import/first */

describe('translation attempts', () => {
  it('does not confuse a late response with a newer request for the same message', () => {
    const message = 'message' as Ref<ChatMessage>
    const first = startTranslating(message)
    stopTranslating(message)
    const second = startTranslating(message)
    shownTranslatedMessagesStore.update((store) => new Set(store).add(message))
    expect(failTranslating(message, first)).toBe(false)
    expect(get(translatingMessagesStore).has(message)).toBe(true)
    expect(get(shownTranslatedMessagesStore).has(message)).toBe(true)
    expect(isTranslationAttempt(message, first)).toBe(false)
    expect(isTranslationAttempt(message, second)).toBe(true)
    expect(failTranslating(message, second)).toBe(true)
    expect(get(translatingMessagesStore).has(message)).toBe(false)
    expect(get(shownTranslatedMessagesStore).has(message)).toBe(false)
  })
})
