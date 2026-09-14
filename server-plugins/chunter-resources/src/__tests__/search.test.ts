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

import {
  type Class,
  type Doc,
  type Hierarchy,
  MeasureMetricsContext,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult
} from '@hcengineering/core'
import contactPlugin from '@hcengineering/contact'
import chunter from '@hcengineering/chunter'
import type { WithFind } from '@hcengineering/server-core'

import { ChatMessageSearchTitleProvider } from '../search'

const ALICE = 'social:alice' as PersonId
const PERSON_ALICE = 'person:alice' as Ref<Doc>
const CHANNEL = 'space:general' as Ref<Space>

const channel = {
  _id: CHANNEL,
  _class: chunter.class.Channel,
  name: 'General'
} as unknown as Space

function message (id: string, createdBy: PersonId): Doc {
  return {
    _id: id as Ref<Doc>,
    _class: chunter.class.ChatMessage,
    space: CHANNEL,
    createdBy,
    modifiedBy: createdBy,
    modifiedOn: 0
  } as unknown as Doc
}

/** Only DirectMessage takes the members path; everything else reads `space.name`. */
const hierarchy = {
  isDerived: (_class: Ref<Class<Doc>>, from: Ref<Class<Doc>>) => _class === from
} as unknown as Hierarchy

/** Counts the lookups so a lost memo shows up as a number, not as a slowdown nobody sees. */
function createStorage (): { storage: WithFind, calls: () => number } {
  let calls = 0
  const storage = {
    findAll: async (_ctx: MeasureContext, _class: Ref<Class<Doc>>, _query: any) => {
      calls++
      if (_class === contactPlugin.class.SocialIdentity) {
        return toFindResult([{ _id: ALICE, attachedTo: PERSON_ALICE }] as any)
      }
      if (_class === contactPlugin.class.Person) {
        return toFindResult([{ _id: PERSON_ALICE, name: 'Smith,Alice' }] as any)
      }
      return toFindResult([] as any)
    }
  } as unknown as WithFind

  return { storage, calls: () => calls }
}

async function titleFor (ctx: MeasureContext, storage: WithFind, doc: Doc): Promise<string> {
  return await ChatMessageSearchTitleProvider(doc, undefined, channel, hierarchy, 'title', ctx, storage)
}

describe('ChatMessageSearchTitleProvider', () => {
  it('builds the title from the author and the channel', async () => {
    const ctx = new MeasureMetricsContext('test', {})
    ctx.contextData = { contextCache: new Map() }
    const { storage } = createStorage()

    expect(await titleFor(ctx, storage, message('m1', ALICE))).toBe('Alice Smith — General')
  })

  it('resolves an author once per batch, not once per message', async () => {
    const ctx = new MeasureMetricsContext('test', {})
    ctx.contextData = { contextCache: new Map() }
    const { storage, calls } = createStorage()

    for (const id of ['m1', 'm2', 'm3']) {
      await titleFor(ctx, storage, message(id, ALICE))
    }

    // One SocialIdentity lookup plus one Person lookup, then the memo answers.
    expect(calls()).toBe(2)
  })

  it('does not carry a resolved name across batches', async () => {
    // The regression guarded here is a module level cache: the fulltext pod indexes every
    // workspace in one process, so a name memoized forever outlives both the batch and the
    // workspace, and keeps serving a name the person has since changed.
    const { storage, calls } = createStorage()

    for (let batch = 0; batch < 2; batch++) {
      const ctx = new MeasureMetricsContext('test', {})
      ctx.contextData = { contextCache: new Map() }
      await titleFor(ctx, storage, message('m1', ALICE))
    }

    expect(calls()).toBe(4)
  })

  it('still resolves when there is no session to cache on', async () => {
    // Outside the indexer `contextData` is undefined. That must cost the memo, not the answer.
    const ctx = new MeasureMetricsContext('test', {})
    const { storage } = createStorage()

    expect(await titleFor(ctx, storage, message('m1', ALICE))).toBe('Alice Smith — General')
  })

  it('returns just the channel in short mode', async () => {
    const ctx = new MeasureMetricsContext('test', {})
    ctx.contextData = { contextCache: new Map() }
    const { storage, calls } = createStorage()

    const short = await ChatMessageSearchTitleProvider(
      message('m1', ALICE),
      undefined,
      channel,
      hierarchy,
      'short',
      ctx,
      storage
    )

    expect(short).toBe('General')
    // A named space needs no lookup at all.
    expect(calls()).toBe(0)
  })
})
