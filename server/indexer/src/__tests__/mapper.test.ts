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

import { Hierarchy, type Class, type Doc, type PersonId, type Ref, type Space } from '@hcengineering/core'
import type { IndexedDoc } from '@hcengineering/server-core'

import { mapSearchResultDoc } from '../mapper'

const MESSAGE_CLASS = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const CHANNEL = 'space:general' as Ref<Space>
const ALICE = 'person:alice' as PersonId

function indexed (extra: Partial<IndexedDoc> = {}): IndexedDoc {
  return {
    id: 'msg1' as Ref<Doc>,
    _class: [MESSAGE_CLASS],
    space: CHANNEL,
    modifiedBy: ALICE,
    modifiedOn: 1700000000000,
    ...extra
  }
}

describe('mapSearchResultDoc', () => {
  // A bare Hierarchy is enough: without a registered SearchPresenter mixin the mapper takes the
  // plain path, which is what these assertions are about.
  const hierarchy = new Hierarchy()

  it('reads createdOn and createdBy from their prefixed index keys', () => {
    // The regression: the mapper used to read `raw.createdOn`, which nothing ever set, so every
    // single search result came back with an undefined timestamp.
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({
        'core:class:Doc%createdOn': 1699999999000,
        'core:class:Doc%createdBy': ALICE
      })
    )

    expect(doc.doc.createdOn).toBe(1699999999000)
    expect(doc.doc.createdBy).toBe(ALICE)
  })

  it('coerces the string timestamps elastic returns for epoch_millis fields', () => {
    // Elastic hands back date fields as strings, and `new Date("1699999999000")` is an
    // Invalid Date - the search rows rendered "Invalid Date" until this was coerced.
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ 'core:class:Doc%createdOn': '1699999999000', modifiedOn: '1700000000000' as any })
    )

    expect(doc.doc.createdOn).toBe(1699999999000)
    expect(doc.doc.modifiedOn).toBe(1700000000000)
    expect(new Date(doc.doc.createdOn as number).getFullYear()).toBe(2023)
  })

  it('falls back to the bare keys for documents indexed by an older version', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed({ createdOn: 1688888888000, createdBy: ALICE }))

    expect(doc.doc.createdOn).toBe(1688888888000)
    expect(doc.doc.createdBy).toBe(ALICE)
  })

  it('prefers the prefixed key over a stale bare one', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ 'core:class:Doc%createdOn': 1699999999000, createdOn: 1600000000000 })
    )

    expect(doc.doc.createdOn).toBe(1699999999000)
  })

  it('leaves the timestamp undefined when the index carries none', () => {
    // Rather than 0, which renders as 1970 in a result row.
    const doc = mapSearchResultDoc(hierarchy, indexed())

    expect(doc.doc.createdOn).toBeUndefined()
  })

  it('leaves the timestamp undefined for a value that is not a number', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed({ 'core:class:Doc%createdOn': 'not a date' }))

    expect(doc.doc.createdOn).toBeUndefined()
  })

  it('keeps a zero timestamp rather than dropping it', () => {
    // `0` is falsy, so a `??`-free implementation would lose it.
    const doc = mapSearchResultDoc(hierarchy, indexed({ 'core:class:Doc%createdOn': 0 }))

    expect(doc.doc.createdOn).toBe(0)
  })

  it('carries space and modified metadata needed to render a result row', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed())

    expect(doc.doc.space).toBe(CHANNEL)
    expect(doc.doc.modifiedOn).toBe(1700000000000)
    expect(doc.doc.modifiedBy).toBe(ALICE)
  })

  it('reports content fragments without naming the index field they came from', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ _highlights: { highlightableContent: ['the <em>release</em> notes'] } })
    )

    expect(doc.highlights).toEqual({ content: ['the <em>release</em> notes'] })
  })

  it('falls back to the russian analyser fragments', () => {
    // Same text, a different analyser matched it - the caller should not have to care which.
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ _highlights: { 'highlightableContent.ru': ['<em>релиз</em> готов'] } })
    )

    expect(doc.highlights).toEqual({ content: ['<em>релиз</em> готов'] })
  })

  it('falls back to the shared summary when no dedicated field matched', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed({ _highlights: { fulltextSummary: ['a <em>match</em>'] } }))

    expect(doc.highlights).toEqual({ content: ['a <em>match</em>'] })
  })

  it('keeps title fragments apart from content ones', () => {
    // A title is different text, not another copy of the body, so it must not be collapsed in.
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ _highlights: { searchTitle: ['<em>Alice</em> — General'], fulltextSummary: ['body'] } })
    )

    expect(doc.highlights).toEqual({ content: ['body'], title: ['<em>Alice</em> — General'] })
  })

  it('prefers the dedicated field over the shared summary', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ _highlights: { highlightableContent: ['exact'], fulltextSummary: ['duplicate'] } })
    )

    expect(doc.highlights).toEqual({ content: ['exact'] })
  })

  it('carries thread parent references so a result can be opened without a db round trip', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({
        objectId: 'card1' as Ref<Doc>,
        objectClass: 'card:class:Card' as Ref<Class<Doc>>
      })
    )

    expect((doc.doc as any).objectId).toBe('card1')
    expect((doc.doc as any).objectClass).toBe('card:class:Card')
  })

  it('omits thread parent references when only one half is indexed', () => {
    // Both are needed to open a thread, so half a reference is no reference at all.
    const doc = mapSearchResultDoc(hierarchy, indexed({ objectId: 'card1' as Ref<Doc> }))

    expect((doc.doc as any).objectId).toBeUndefined()
    expect((doc.doc as any).objectClass).toBeUndefined()
  })

  it('omits thread parent references for a top level message', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed())

    expect((doc.doc as any).objectId).toBeUndefined()
  })

  it('carries the attachment the message hangs off', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ attachedTo: 'chan1' as Ref<Doc>, attachedToClass: 'chunter:class:Channel' as Ref<Class<Doc>> })
    )

    expect(doc.doc.attachedTo).toBe('chan1')
    expect(doc.doc.attachedToClass).toBe('chunter:class:Channel')
  })

  it('leaves highlights undefined when the search asked for none', () => {
    const doc = mapSearchResultDoc(hierarchy, indexed())

    expect(doc.highlights).toBeUndefined()
  })

  it('keeps title, id and score', () => {
    const doc = mapSearchResultDoc(
      hierarchy,
      indexed({ searchTitle: 'Alice — General', searchShortTitle: 'General', _score: 4.2 })
    )

    expect(doc.id).toBe('msg1')
    expect(doc.title).toBe('Alice — General')
    expect(doc.shortTitle).toBe('General')
    expect(doc.score).toBe(4.2)
    expect(doc.doc._class).toBe(MESSAGE_CLASS)
  })
})
