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

import { Class, Doc, MeasureMetricsContext, PersonId, Ref, Space, WorkspaceUuid } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import serverCore, { type FullTextAdapter, type IndexedDoc } from '@hcengineering/server-core'

import { createElasticAdapter } from '../adapter'

// An index of its own, created from the mapping in the adapter. The shared one is also written to
// by `adapter.test.ts`, which never calls `initMapping` - running first, it would have Elastic
// infer a mapping with no `term_vector`, and every highlight query against it then fails outright.
setMetadata(serverCore.metadata.ElasticIndexName, 'search_string_test')

const MESSAGE_CLASS = 'chunter:class:ChatMessage' as Ref<Class<Doc>>
const OTHER_CLASS = 'tracker:class:Issue' as Ref<Class<Doc>>
const CHANNEL_CLASS = 'chunter:class:Channel' as Ref<Class<Doc>>

const GENERAL = 'space:general' as Ref<Space>
const RANDOM = 'space:random' as Ref<Space>

const ALICE = 'person:alice' as PersonId
const BOB = 'person:bob' as PersonId

const DAY = 24 * 60 * 60 * 1000
const T0 = 1700000000000

function message (
  id: string,
  content: string,
  opts: {
    space?: Ref<Space>
    createdBy?: PersonId
    createdOn?: number
    title?: string
    hasAttachment?: boolean
  } = {}
): IndexedDoc {
  return {
    id: id as Ref<Doc>,
    _class: [MESSAGE_CLASS],
    space: opts.space ?? GENERAL,
    modifiedBy: opts.createdBy ?? ALICE,
    modifiedOn: opts.createdOn ?? T0,
    searchTitle: opts.title ?? 'Alice — General',
    attachedToClass: CHANNEL_CLASS,
    highlightableContent: content,
    fulltextSummary: content,
    hasAttachment: opts.hasAttachment ?? false,
    'core:class:Doc%createdBy': opts.createdBy ?? ALICE,
    'core:class:Doc%createdOn': opts.createdOn ?? T0
  }
}

describe('Elastic search string', () => {
  let adapter: FullTextAdapter
  const ctx = new MeasureMetricsContext('-', {})
  const ws = 'ws-search' as WorkspaceUuid

  beforeAll(async () => {
    adapter = await createElasticAdapter(process.env.ELASTIC_URL ?? 'http://localhost:9201/')
    await adapter.initMapping(ctx)

    const docs: IndexedDoc[] = [
      message('m1', 'release notes for the quarterly report are ready'),
      message('m2', 'the release is delayed, notes will follow later', { createdOn: T0 + DAY }),
      message('m3', 'полностью переписали поиск по сообщениям', { createdBy: BOB, createdOn: T0 + 2 * DAY }),
      message('m4', 'secret plan in another channel', { space: RANDOM, createdBy: BOB }),
      message('m5', 'here is the spreadsheet you asked for', { hasAttachment: true, createdOn: T0 + 3 * DAY }),
      { ...message('m6', 'quarterly planning discussed on the call'), collection: 'transcription' },
      // Cyrillic counterparts of m1/m2, so every language neutral claim can be made twice.
      message('r1', 'заметки о релизе квартального отчёта готовы', { createdOn: T0 + 4 * DAY }),
      message('r2', 'релиз задерживается, заметки пришлю позже', { createdOn: T0 + 5 * DAY })
    ]
    // An unrelated class, to prove class filtering still narrows.
    docs.push({
      id: 'i1' as Ref<Doc>,
      _class: [OTHER_CLASS],
      space: GENERAL,
      modifiedBy: ALICE,
      modifiedOn: T0,
      searchTitle: 'release notes issue',
      fulltextSummary: 'release notes issue'
    })
    // updateMany goes through the bulk API, which refreshes the index for us.
    await adapter.updateMany(ctx, ws, docs)
  }, 60000)

  afterAll(async () => {
    await adapter.clean(ctx, ws)
    await adapter.close()
  })

  function ids (result: { docs: IndexedDoc[] }): string[] {
    return result.docs.map((d) => d.id)
  }

  it('finds a message by a single word', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'quarterly', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toContain('m1')
  })

  it('finds messages matching most of a multi word query', async () => {
    // Plain `and` returns nothing unless every term is present.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes quarterly missingword', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)).toContain('m1')
  })

  it('finds the words in any order and distance', async () => {
    // Both have the two words, only m1 as a phrase.
    const result = await adapter.searchString(ctx, ws, { query: 'notes release', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result).sort()).toEqual(['m1', 'm2'])
  })

  it('finds a word by the prefix being typed', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'quarter', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toContain('m1')

    const russian = await adapter.searchString(ctx, ws, { query: 'переписали поис', classes: [MESSAGE_CLASS] }, {})
    expect(ids(russian)).toEqual(['m3'])
  })

  it('does not let the stemmer widen the prefix', async () => {
    // `полностью` is indexed; `поло` is not how it starts, whatever the stemmer makes of it.
    const result = await adapter.searchString(ctx, ws, { query: 'поло', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toEqual([])
  })

  it('demands every word unless asked to be fuzzy', async () => {
    // The default stays strict, so a picker does not start offering rows that merely resemble
    // what was typed.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes quarterly missingword', classes: [MESSAGE_CLASS] },
      {}
    )
    expect(ids(result)).toEqual([])
  })

  it('ranks the exact phrase above a scattered match', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)[0]).toBe('m1')
  })

  it('tolerates a typo when fuzzy', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterlyy', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)).toContain('m1')
  })

  it('does not tolerate a typo by default', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'quarterlyy', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toEqual([])
  })

  it('matches russian content across word forms', async () => {
    // `сообщение` must match the indexed `сообщениям` through the russian stemmer.
    const result = await adapter.searchString(ctx, ws, { query: 'сообщение', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toContain('m3')
  })

  it('matches russian across word forms when fuzzy', async () => {
    // The stemmer lives on the `.ru` subfield, which both query shapes run over: `сообщение`
    // against the indexed `сообщениям`, `релиз` against `релизе`.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'сообщение', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)).toContain('m3')

    const other = await adapter.searchString(ctx, ws, { query: 'релиз', classes: [MESSAGE_CLASS] }, { fuzzy: true })
    expect(ids(other)).toContain('r1')
  })

  it('finds russian messages matching most of a multi word query', async () => {
    // The latin counterpart of this is `finds messages matching most of a multi word query`.
    const result = await adapter.searchString(
      ctx,
      ws,
      // Base forms against the inflected ones in the text, so the stemmer has to do its job.
      { query: 'заметка релиз квартальный отсутствующее', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)).toContain('r1')
  })

  it('demands every russian word unless asked to be fuzzy', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'заметка релиз квартальный отсутствующее', classes: [MESSAGE_CLASS] },
      {}
    )
    expect(ids(result)).toEqual([])
  })

  it('tolerates a russian typo when fuzzy', async () => {
    // `квартальнго` is one deletion away from the indexed `квартального`.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'квартальнго', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)).toContain('r1')
  })

  it('does not tolerate a russian typo by default', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'квартальнго', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).toEqual([])
  })

  it('ranks the exact russian phrase above a scattered match', async () => {
    // `r1` has the words next to each other, `r2` has both but far apart.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'заметки о релизе', classes: [MESSAGE_CLASS] },
      { fuzzy: true }
    )
    expect(ids(result)[0]).toBe('r1')
  })

  it('narrows by class', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'release notes', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).not.toContain('i1')
  })

  it('narrows by space', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'secret plan', classes: [MESSAGE_CLASS], spaces: [GENERAL] },
      {}
    )
    expect(ids(result)).not.toContain('m4')
  })

  it('narrows by author', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'поиск', classes: [MESSAGE_CLASS], filters: { createdBy: [ALICE] } },
      {}
    )
    expect(ids(result)).not.toContain('m3')
  })

  it('matches nothing when a filter resolves to an empty set', async () => {
    // A caller that asked to filter by author and found no social ids for them must get no rows.
    // Ignoring the empty set would hand back everyone's messages instead.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release', classes: [MESSAGE_CLASS], filters: { createdBy: [] } },
      {}
    )
    expect(ids(result)).toEqual([])
  })

  it('matches nothing for an empty object filter', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release', classes: [MESSAGE_CLASS], filters: { attachedTo: [] } },
      {}
    )
    expect(ids(result)).toEqual([])
  })

  it('narrows by date range', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes', classes: [MESSAGE_CLASS], filters: { createdAfter: T0 + DAY / 2 } },
      {}
    )
    expect(ids(result)).toContain('m2')
    expect(ids(result)).not.toContain('m1')
  })

  it('narrows by attachment presence', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'spreadsheet', classes: [MESSAGE_CLASS], filters: { hasAttachment: true } },
      {}
    )
    expect(ids(result)).toContain('m5')

    const none = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterly', classes: [MESSAGE_CLASS], filters: { hasAttachment: true } },
      {}
    )
    expect(ids(none)).not.toContain('m1')
  })

  it('sorts by date', async () => {
    const desc = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes spreadsheet поиск', classes: [MESSAGE_CLASS] },
      { sort: 'date-desc' }
    )
    const timestamps = desc.docs.map((d) => d['core:class:Doc%createdOn'])
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))

    const asc = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes spreadsheet поиск', classes: [MESSAGE_CLASS] },
      { sort: 'date-asc' }
    )
    expect(asc.docs.map((d) => d.id).reverse()).toEqual(desc.docs.map((d) => d.id))
  })

  it('pages through results with a cursor without repeating documents', async () => {
    const first = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes spreadsheet поиск secret', classes: [MESSAGE_CLASS] },
      // Fuzzy, so that a query touching several documents at once has more than one page.
      { limit: 2, sort: 'date-desc', fuzzy: true }
    )
    expect(first.docs).toHaveLength(2)
    expect(first.cursor).toBeDefined()

    const second = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes spreadsheet поиск secret', classes: [MESSAGE_CLASS] },
      { limit: 2, sort: 'date-desc', cursor: first.cursor, fuzzy: true }
    )
    expect(ids(second)).not.toEqual(expect.arrayContaining(ids(first)))
  })

  it('excludes the listed collections', async () => {
    // Meeting transcripts are opt-in, so the default search must not surface them.
    const withTranscript = await adapter.searchString(ctx, ws, { query: 'quarterly', classes: [MESSAGE_CLASS] }, {})
    expect(ids(withTranscript)).toContain('m6')

    const without = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterly', classes: [MESSAGE_CLASS], filters: { excludeCollections: ['transcription'] } },
      {}
    )
    expect(ids(without)).not.toContain('m6')
    // Documents with no `collection` at all must survive the exclusion.
    expect(ids(without)).toContain('m1')
  })

  it('narrows by the class an object is attached to', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes', classes: [MESSAGE_CLASS], filters: { attachedToClass: [CHANNEL_CLASS] } },
      {}
    )
    expect(ids(result)).toContain('m1')

    const other = await adapter.searchString(
      ctx,
      ws,
      { query: 'release notes', classes: [MESSAGE_CLASS], filters: { attachedToClass: [OTHER_CLASS] } },
      {}
    )
    expect(ids(other)).not.toContain('m1')
  })

  it('reports a total', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'release', classes: [MESSAGE_CLASS] }, { limit: 1 })
    expect(result.total).toBeGreaterThanOrEqual(2)
    expect(result.totalExact).toBe(true)
  })

  it('returns highlighted fragments around the match', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterly', classes: [MESSAGE_CLASS] },
      { highlight: { preTag: '<b>', postTag: '</b>' } }
    )
    const hit = result.docs.find((d) => d.id === 'm1')
    expect(hit).toBeDefined()
    const fragments = hit?._highlights?.highlightableContent ?? []
    expect(fragments.length).toBeGreaterThan(0)
    expect(fragments.join(' ')).toContain('<b>quarterly</b>')
  })

  it("matches the title when searchIn is 'title'", async () => {
    // `i1` carries its text in searchTitle only, so it is reachable through the title path.
    const result = await adapter.searchString(ctx, ws, { query: 'release notes' }, { searchIn: 'title' })
    expect(ids(result)).toContain('i1')
  })

  it("ignores the title when searchIn is 'content'", async () => {
    // Every message shares the title "Alice — General", so a query matching a title must not
    // pull in rows whose body never mentions it - that is what the mode is for.
    const result = await adapter.searchString(ctx, ws, { query: 'Alice' }, { searchIn: 'content' })
    expect(ids(result)).toEqual([])
  })

  it("matches through fulltextSummary when searchIn is 'content'", async () => {
    // `i1` has no highlightableContent of its own, but `fulltextSummary` is one of the content
    // fields the query runs over, so it is still reachable in this mode.
    const result = await adapter.searchString(ctx, ws, { query: 'release notes' }, { searchIn: 'content' })
    expect(ids(result)).toContain('i1')
    expect(ids(result)).toContain('m1')
  })

  it('searches title and content together by default', async () => {
    const result = await adapter.searchString(ctx, ws, { query: 'release notes' }, {})
    expect(ids(result)).toContain('i1')
    expect(ids(result)).toContain('m1')
  })

  it("matches russian content when searchIn is 'content'", async () => {
    // Base form against the inflected `квартального` in the text.
    const result = await adapter.searchString(ctx, ws, { query: 'квартальный' }, { searchIn: 'content' })
    expect(ids(result)).toContain('r1')
  })

  it("ignores the title for a russian query when searchIn is 'content'", async () => {
    // The latin counterpart matches on the author name; this one on the channel half of the
    // title, which every message in `space:general` shares.
    const result = await adapter.searchString(ctx, ws, { query: 'General' }, { searchIn: 'content' })
    expect(ids(result)).toEqual([])
  })

  it('turns highlighting on with a bare `true`', async () => {
    // The defaults, without spelling out an options object.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterly', classes: [MESSAGE_CLASS] },
      { highlight: true }
    )
    const hit = result.docs.find((d) => d.id === 'm1')
    expect(hit?._highlights?.highlightableContent?.length ?? 0).toBeGreaterThan(0)
  })

  it('leaves highlighting off for `false`', async () => {
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'quarterly', classes: [MESSAGE_CLASS] },
      { highlight: false }
    )
    const hit = result.docs.find((d) => d.id === 'm1')
    expect(hit).toBeDefined()
    expect(hit?._highlights).toBeUndefined()
  })

  it('returns highlighted fragments for russian text', async () => {
    // The fragments come back under the `.ru` subfield, since that is where the stemmer matched.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'релиз', classes: [MESSAGE_CLASS] },
      { highlight: { preTag: '<b>', postTag: '</b>' }, fuzzy: true }
    )
    const hit = result.docs.find((d) => d.id === 'r2')
    expect(hit).toBeDefined()
    const fragments = [
      ...(hit?._highlights?.highlightableContent ?? []),
      ...(hit?._highlights?.['highlightableContent.ru'] ?? [])
    ]
    expect(fragments.join(' ')).toContain('<b>релиз</b>')
  })

  it('highlights a russian word form the stemmer matched', async () => {
    // `релизе` is what the document says; the query is the base form.
    const result = await adapter.searchString(
      ctx,
      ws,
      { query: 'релиз', classes: [MESSAGE_CLASS] },
      { highlight: { preTag: '<b>', postTag: '</b>' }, fuzzy: true }
    )
    const hit = result.docs.find((d) => d.id === 'r1')
    const fragments = hit?._highlights?.['highlightableContent.ru'] ?? []
    expect(fragments.join(' ')).toContain('<b>релизе</b>')
  })

  it('skips a document with no searchTitle at all', async () => {
    // The indexer always writes a title, so its absence means the document never went through
    // properly - there is nothing to render a row from, and it is treated as broken.
    const doc: IndexedDoc = {
      id: 'm7' as Ref<Doc>,
      _class: [MESSAGE_CLASS],
      space: GENERAL,
      modifiedBy: ALICE,
      modifiedOn: T0,
      highlightableContent: 'titleless message about penguins',
      fulltextSummary: 'titleless message about penguins'
    }
    await adapter.updateMany(ctx, ws, [doc])

    const result = await adapter.searchString(ctx, ws, { query: 'penguins', classes: [MESSAGE_CLASS] }, {})
    expect(ids(result)).not.toContain('m7')
  })
})
