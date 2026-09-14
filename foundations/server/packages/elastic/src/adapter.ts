//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021 Hardcore Engineering Inc.
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

import { Analytics } from '@hcengineering/analytics'
import {
  Class,
  Doc,
  DocumentQuery,
  MeasureContext,
  notEmpty,
  Ref,
  SearchOptions,
  SearchQuery,
  TxResult,
  WorkspaceUuid
} from '@hcengineering/core'
import type { FullTextAdapter, IndexedDoc, SearchScoring, SearchStringResult } from '@hcengineering/server-core'
import serverCore from '@hcengineering/server-core'
import { Client, errors as esErr, estypes } from '@elastic/elasticsearch'
import { getMetadata } from '@hcengineering/platform'

import { KEYBOARD_MAPPINGS_CYRILLIC_TO_LATIN, KEYBOARD_MAPPINGS_LATIN_TO_CYRILLIC } from './utils'

const DEFAULT_LIMIT = 200

// Indexed attributes of core.class.Doc are stored under their prefixed keys.
const CREATED_ON_FIELD = 'core:class:Doc%createdOn'
const CREATED_BY_FIELD = 'core:class:Doc%createdBy'

// Above this many hits the reported total becomes a lower bound, which keeps counting cheap.
const TOTAL_TRACKING_LIMIT = 10000

// Control characters are used as highlight markers so that message text containing literal
// `<em>` cannot be confused for a marker by the client side splitter.
const HIGHLIGHT_PRE_TAG = '\u0001'
const HIGHLIGHT_POST_TAG = '\u0002'

function getIndexName (): string {
  return getMetadata(serverCore.metadata.ElasticIndexName) ?? 'storage_index'
}

function getIndexVersion (): string {
  return getMetadata(serverCore.metadata.ElasticIndexVersion) ?? 'v5'
}

const mappings: estypes.MappingTypeMapping = {
  properties: {
    fulltextSummary: {
      type: 'text',
      analyzer: 'rebuilt_english'
    },
    // Filled only for classes naming an attribute in SearchPresenter.highlightableField.
    // `term_vector` roughly doubles the stored size of this field, which is why it lives here
    // and not on the shared `fulltextSummary` that also carries documents and blob content.
    highlightableContent: {
      type: 'text',
      analyzer: 'rebuilt_english',
      term_vector: 'with_positions_offsets',
      fields: {
        ru: {
          type: 'text',
          analyzer: 'rebuilt_russian',
          term_vector: 'with_positions_offsets'
        }
      }
    },
    hasAttachment: {
      type: 'boolean',
      index: true
    },
    searchTitle: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: {
          type: 'keyword',
          ignore_above: 256
        },
        translit: {
          type: 'text',
          analyzer: 'translit_analyzer'
        },
        keyboard_latin_to_cyrillic: {
          type: 'text',
          analyzer: 'rebuilt_english',
          search_analyzer: 'keyboard_latin_to_cyrillic_analyzer'
        },
        keyboard_cyrillic_to_latin: {
          type: 'text',
          analyzer: 'rebuilt_english',
          search_analyzer: 'keyboard_cyrillic_to_latin_analyzer'
        }
      }
    },
    workspaceId: {
      type: 'keyword',
      index: true
    },
    id: {
      type: 'keyword',
      index: true
    },
    _class: {
      type: 'keyword',
      index: true
    },
    attachedTo: {
      type: 'keyword',
      index: true
    },
    attachedToClass: {
      type: 'keyword',
      index: true
    },
    collection: {
      type: 'keyword',
      index: true
    },
    rootObject: {
      type: 'keyword',
      index: true
    },
    rootObjectClass: {
      type: 'keyword',
      index: true
    },
    space: {
      type: 'keyword',
      index: true
    },
    'core:class:Doc%createdBy': {
      type: 'keyword',
      index: true
    },
    'core:class:Doc%createdOn': {
      type: 'date',
      format: 'epoch_millis',
      index: true
    },
    modifiedBy: {
      type: 'keyword',
      index: true
    },
    modifiedOn: {
      type: 'date',
      format: 'epoch_millis',
      index: true
    },
    'core:class:Doc%modifiedBy': {
      type: 'keyword',
      index: true
    },
    'core:class:Doc%modifiedOn': {
      type: 'date',
      format: 'epoch_millis',
      index: true
    },
    viewerId: {
      type: 'keyword',
      index: true
    }
  }
}

class ElasticAdapter implements FullTextAdapter {
  private readonly getFulltextDocId: (workspaceId: WorkspaceUuid, doc: Ref<Doc>) => Ref<Doc>
  private readonly getDocId: (workspaceId: WorkspaceUuid, fulltext: Ref<Doc>) => Ref<Doc>
  private readonly indexName: string

  constructor (
    private readonly client: Client,
    private readonly indexBaseName: string,
    readonly indexVersion: string
  ) {
    this.indexName = `${indexBaseName}_${indexVersion}`
    this.getFulltextDocId = (workspaceId, doc) => `${doc}@${workspaceId}` as Ref<Doc>
    this.getDocId = (workspaceId, fulltext) => fulltext.slice(0, -1 * (workspaceId.length + 1)) as Ref<Doc>
  }

  async initMapping (ctx: MeasureContext): Promise<boolean> {
    const indexName = this.indexName
    try {
      const existingVersions = await ctx.withSync('get-indexes', {}, () =>
        this.client.indices.get({
          index: [`${this.indexBaseName}_*`]
        })
      )
      const allIndexes = Object.keys(existingVersions)
      const existingOldVersionIndices = allIndexes.filter((name) => name !== indexName)
      const existsIndex = allIndexes.find((it) => it === indexName) !== undefined
      let shouldDropExistingIndex = false
      if (existsIndex) {
        const mapping = await ctx.with('get-mapping', { indexName }, () =>
          this.client.indices.getMapping({
            index: indexName
          })
        )
        for (const [propName, propType] of Object.entries(mappings.properties ?? {})) {
          if ((mapping as any)[indexName]?.mappings?.properties?.[propName]?.type !== propType.type) {
            shouldDropExistingIndex = true
            break
          }
        }
      }
      if (existingOldVersionIndices.length > 0 || shouldDropExistingIndex) {
        await ctx.with('delete-old-index', {}, () =>
          this.client.indices.delete({
            index: shouldDropExistingIndex ? allIndexes : existingOldVersionIndices
          })
        )
      }
      if (!existsIndex || shouldDropExistingIndex) {
        await ctx.with('create-index', { indexName }, () =>
          this.client.indices.create({
            index: indexName,
            settings: {
              analysis: {
                char_filter: {
                  keyboard_layout_mapping_latin_to_cyrillic: {
                    type: 'mapping',
                    mappings: KEYBOARD_MAPPINGS_LATIN_TO_CYRILLIC
                  },
                  keyboard_layout_mapping_cyrillic_to_latin: {
                    type: 'mapping',
                    mappings: KEYBOARD_MAPPINGS_CYRILLIC_TO_LATIN
                  }
                },
                filter: {
                  english_stemmer: {
                    type: 'stemmer',
                    language: 'english'
                  },
                  english_possessive_stemmer: {
                    type: 'stemmer',
                    language: 'possessive_english'
                  },
                  transliteration_filter: {
                    type: 'icu_transform',
                    id: 'Any-Latin; NFD; [:Nonspacing Mark:] Remove; NFC'
                  },
                  remove_apostrophe: {
                    type: 'pattern_replace',
                    pattern: "[ʹ\\'ʼ]",
                    replacement: ''
                  },
                  russian_stemmer: {
                    type: 'stemmer',
                    language: 'russian'
                  }
                },
                analyzer: {
                  keyboard_latin_to_cyrillic_analyzer: {
                    type: 'custom',
                    char_filter: ['keyboard_layout_mapping_latin_to_cyrillic'],
                    tokenizer: 'standard',
                    filter: ['lowercase', 'english_stemmer']
                  },
                  keyboard_cyrillic_to_latin_analyzer: {
                    type: 'custom',
                    char_filter: ['keyboard_layout_mapping_cyrillic_to_latin'],
                    tokenizer: 'standard',
                    filter: ['lowercase', 'english_stemmer']
                  },
                  translit_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'icu_folding', 'transliteration_filter', 'remove_apostrophe']
                  },
                  rebuilt_english: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['english_possessive_stemmer', 'lowercase', 'english_stemmer']
                  },
                  rebuilt_russian: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'russian_stemmer']
                  }
                }
              }
            },
            mappings
          })
        )
      } else {
        await ctx.with('put-mapping', {}, () =>
          this.client.indices.putMapping({
            index: indexName,
            ...mappings
          })
        )
      }
    } catch (err: any) {
      if (err.name === 'ConnectionError') {
        ctx.warn('Elastic DB is not available')
      }
      Analytics.handleError(err)
      ctx.error(err)
      return false
    }
    return true
  }

  async close (): Promise<void> {
    await this.client.close()
  }

  async searchString (
    ctx: MeasureContext,
    workspaceId: WorkspaceUuid,
    query: SearchQuery,
    options: SearchOptions & { scoring?: SearchScoring[] }
  ): Promise<SearchStringResult> {
    try {
      const { viewerId } = options
      const searchIn = options.searchIn ?? 'all'
      const titleFields = [
        'searchTitle^50',
        'searchShortTitle^50',
        'searchTitle.translit^10',
        'searchTitle.keyboard_latin_to_cyrillic^10',
        'searchTitle.keyboard_cyrillic_to_latin^10'
      ]
      // An explicit field list instead of '*': the wildcard expands over every mapped field,
      // including keyword fields holding uuids, which is both noise and measurably slower.
      const contentFields = ['highlightableContent^8', 'highlightableContent.ru^8', 'fulltextSummary^3']
      const fields =
        searchIn === 'title' ? titleFields : searchIn === 'content' ? contentFields : [...titleFields, ...contentFields]

      const mainQuery = query.query.startsWith('*')
        ? {
            bool: {
              should: [
                {
                  // Clause 1: Prefix priority
                  simple_query_string: {
                    query: query.query.substring(1),
                    analyze_wildcard: true,
                    flags: 'OR|PREFIX|PHRASE|FUZZY|NOT|ESCAPE',
                    default_operator: 'and',
                    fields,
                    boost: 10
                  }
                },
                {
                  // Clause 2: Match anywhere
                  query_string: {
                    query: query.query,
                    analyze_wildcard: true,
                    allow_leading_wildcard: true,
                    lenient: true,
                    default_operator: 'and',
                    fields,
                    boost: 1
                  }
                }
              ],
              minimum_should_match: 1
            }
          }
        : options.fuzzy === true
          ? {
              bool: {
                should: [
                  // Exact phrase is the strongest signal: "release notes" must beat a document
                  // merely containing "release" and "notes" far apart.
                  { multi_match: { query: query.query, type: 'phrase', fields, slop: 1, boost: 6 } },
                  {
                    // `minimum_should_match: '2<-25%'` keeps the precision of a plain `and` for
                    // queries of up to three words, while letting longer ones miss a quarter of
                    // their terms - those simply returned nothing before.
                    // `prefix_length: 1` keeps fuzzy expansion off the hot path.
                    multi_match: {
                      query: query.query,
                      type: 'best_fields',
                      fields,
                      operator: 'or',
                      minimum_should_match: '2<-25%',
                      fuzziness: 'AUTO',
                      prefix_length: 1,
                      max_expansions: 30,
                      boost: 2
                    }
                  },
                  // Last token prefix, gives an as-you-type feel without a separate index.
                  { multi_match: { query: query.query, type: 'bool_prefix', fields, boost: 1 } }
                ],
                minimum_should_match: 1
              }
            }
          : {
              simple_query_string: {
                query: query.query,
                analyze_wildcard: true,
                flags: 'OR|PREFIX|PHRASE|FUZZY|NOT|ESCAPE',
                default_operator: 'and',
                fields
              }
            }

      const elasticQuery: any = {
        query: {
          function_score: {
            query: {
              bool: {
                must: [
                  mainQuery,
                  {
                    term: {
                      workspaceId
                    }
                  }
                ]
              }
            },
            boost_mode: 'sum'
          }
        },
        size: options.limit ?? DEFAULT_LIMIT
      }

      // No title means the indexer never got to the document properly: there is nothing to render
      // a result row from, so it is treated as broken rather than returned empty.
      const filter: any = [{ exists: { field: 'searchTitle' } }]

      if (query.spaces !== undefined) {
        filter.push({
          terms: this.getTerms(query.spaces, 'space')
        })
      }
      if (query.classes !== undefined) {
        filter.push({
          terms: this.getTerms(query.classes, '_class')
        })
      }

      if (viewerId !== undefined) {
        filter.push({
          bool: {
            should: [{ bool: { must_not: { exists: { field: 'viewerId' } } } }, { term: { viewerId } }]
          }
        })
      }

      const filters = query.filters
      if (filters?.createdAfter !== undefined || filters?.createdBefore !== undefined) {
        filter.push({
          range: {
            [CREATED_ON_FIELD]: {
              ...(filters.createdAfter !== undefined ? { gte: filters.createdAfter } : {}),
              ...(filters.createdBefore !== undefined ? { lte: filters.createdBefore } : {}),
              format: 'epoch_millis'
            }
          }
        })
      }
      if (filters?.createdBy !== undefined && filters.createdBy.length > 0) {
        filter.push({ terms: this.getTerms(filters.createdBy, CREATED_BY_FIELD) })
      }
      if (filters?.attachedTo !== undefined && filters.attachedTo.length > 0) {
        // Matches both a message hanging off the object and a thread reply whose root it is.
        filter.push({
          bool: {
            should: [
              { terms: this.getTerms(filters.attachedTo, 'attachedTo') },
              { terms: this.getTerms(filters.attachedTo, 'rootObject') }
            ],
            minimum_should_match: 1
          }
        })
      }
      if (filters?.attachedToClass !== undefined && filters.attachedToClass.length > 0) {
        filter.push({ terms: this.getTerms(filters.attachedToClass, 'attachedToClass') })
      }
      if (filters?.hasAttachment === true) {
        filter.push({ term: { hasAttachment: true } })
      }
      if (filters?.excludeCollections !== undefined && filters.excludeCollections.length > 0) {
        // Only classes opting into content indexing carry `collection` at all, and a document
        // sitting in no collection has no such field either. Both must keep matching, hence
        // must_not rather than a positive term list.
        filter.push({
          bool: { must_not: { terms: this.getTerms(filters.excludeCollections, 'collection') } }
        })
      }

      if (filter.length > 0) {
        elasticQuery.query.function_score.query.bool.filter = filter
      }

      if (options.scoring !== undefined) {
        const scoringTerms: any[] = options.scoring.map((scoringOption): any => {
          const field = Object.hasOwn(mappings.properties ?? {}, scoringOption.attr)
            ? scoringOption.attr
            : `${scoringOption.attr}.keyword`
          return {
            term: {
              [field]: {
                value: scoringOption.value,
                boost: scoringOption.boost
              }
            }
          }
        })
        elasticQuery.query.function_score.query.bool.should = scoringTerms
      }

      // Every sort spec ends in a unique tiebreaker so that `search_after` can resume from it.
      // `unmapped_type` guards against shards holding documents older than the date mapping.
      elasticQuery.sort =
        options.sort === 'date-desc'
          ? [{ [CREATED_ON_FIELD]: { order: 'desc', unmapped_type: 'date' } }, { id: 'desc' }]
          : options.sort === 'date-asc'
            ? [{ [CREATED_ON_FIELD]: { order: 'asc', unmapped_type: 'date' } }, { id: 'asc' }]
            : [{ _score: { order: 'desc' } }, { id: 'desc' }]
      elasticQuery.track_total_hits = TOTAL_TRACKING_LIMIT

      if (options.cursor !== undefined) {
        try {
          elasticQuery.search_after = JSON.parse(Buffer.from(options.cursor, 'base64').toString())
        } catch (err: any) {
          ctx.warn('malformed search cursor, ignoring', { error: err })
        }
      }

      if (options.highlight !== undefined) {
        const h = options.highlight
        elasticQuery.highlight = {
          pre_tags: [h.preTag ?? HIGHLIGHT_PRE_TAG],
          post_tags: [h.postTag ?? HIGHLIGHT_POST_TAG],
          // `default`, not `html`: the client splits the fragment on the markers and renders the
          // pieces as text nodes, so Svelte escapes them. Asking Elastic to escape as well turns
          // a `/` in the message into a literal `&#x2F;` on screen.
          encoder: 'default',
          fragment_size: h.fragmentSize ?? 120,
          number_of_fragments: h.numberOfFragments ?? 2,
          order: 'score',
          // The query is a bool of several should clauses; without this each of them would
          // try to produce its own highlight for its own field.
          require_field_match: false,
          fields: {
            // `fvh` uses the term vectors stored on highlightableContent, making it O(fragment).
            // Cut on word boundaries, not sentence ones: a chat message often has no full stop at
            // all, and the scanner then stretches the fragment to the whole text - measured at
            // twice `fragment_size`, still clipped mid word at the end.
            highlightableContent: { type: 'fvh', boundary_scanner: 'word' },
            'highlightableContent.ru': { type: 'fvh', boundary_scanner: 'word' },
            // 0 fragments means the whole field, which is what a short title wants.
            searchTitle: { type: 'unified', number_of_fragments: 0 },
            fulltextSummary: { type: 'unified' }
          }
        }
      }

      const result = await ctx.with(
        'elastic-search-string',
        {
          sort: options.sort ?? 'relevance',
          highlight: options.highlight !== undefined,
          paged: options.cursor !== undefined
        },
        () =>
          this.client.search({
            index: this.indexName,
            ...elasticQuery
          })
      )

      const resp: SearchStringResult = { docs: [] }
      if (result.hits !== undefined) {
        const total = result.hits.total as any
        if (total?.value !== undefined) {
          resp.total = total.value
          resp.totalExact = total.relation === 'eq'
        } else if (typeof total === 'number') {
          resp.total = total
          resp.totalExact = true
        }
        const hits = result.hits.hits as any[]
        resp.docs = hits.map((hit: any) => ({ ...hit._source, _score: hit._score, _highlights: hit.highlight }))

        // Only hand back a cursor when the page was full, otherwise this was the last one.
        const lastHit = hits[hits.length - 1]
        if (lastHit?.sort !== undefined && hits.length === elasticQuery.size) {
          resp.cursor = Buffer.from(JSON.stringify(lastHit.sort)).toString('base64')
        }
      }

      return resp
    } catch (err: any) {
      if (err.name === 'ConnectionError') {
        ctx.warn('Elastic DB is not available')
        return { docs: [], failed: true }
      }
      Analytics.handleError(err)
      ctx.error('Elastic error', { error: err })
      return { docs: [], failed: true }
    }
  }

  async search (
    ctx: MeasureContext,
    workspaceId: WorkspaceUuid,
    _classes: Ref<Class<Doc>>[],
    query: DocumentQuery<Doc>,
    size: number | undefined,
    from: number | undefined,
    viewerId?: string
  ): Promise<IndexedDoc[]> {
    if (query.$search === undefined) return []
    const fields = [
      'searchTitle^50',
      'searchShortTitle^50',
      'searchTitle.translit^10',
      'searchTitle.keyboard_latin_to_cyrillic^10',
      'searchTitle.keyboard_cyrillic_to_latin^10',
      ...(query.$searchStrict === true ? [] : ['*'])
    ]

    const request: any = {
      bool: {
        must: [
          {
            ...(query.$search.startsWith('*')
              ? {
                  bool: {
                    should: [
                      {
                        // Clause 1: Prefix priority
                        simple_query_string: {
                          query: query.$search.substring(1),
                          analyze_wildcard: true,
                          flags: 'OR|PREFIX|PHRASE|FUZZY|NOT|ESCAPE',
                          default_operator: 'and',
                          fields,
                          boost: 10
                        }
                      },
                      {
                        // Clause 2: Match anywhere
                        query_string: {
                          query: query.$search,
                          analyze_wildcard: true,
                          allow_leading_wildcard: true,
                          lenient: true,
                          default_operator: 'and',
                          fields,
                          boost: 1
                        }
                      }
                    ],
                    minimum_should_match: 1
                  }
                }
              : {
                  simple_query_string: {
                    query: query.$search,
                    analyze_wildcard: true,
                    flags: 'OR|PREFIX|PHRASE|FUZZY|NOT|ESCAPE',
                    default_operator: 'and',
                    fields
                  }
                })
          },
          {
            term: {
              workspaceId
            }
          }
        ],
        should: [{ terms: this.getTerms(_classes, '_class', { boost: 10.0 }) }],
        filter: [
          {
            bool: {
              should: [
                { terms: this.getTerms(_classes, '_class') }
                // { terms: this.getTerms(_classes, 'attachedToClass') }
              ]
            }
          }
        ]
      }
    }

    if (viewerId !== undefined) {
      request.bool.filter.push({
        bool: {
          should: [{ bool: { must_not: { exists: { field: 'viewerId' } } } }, { term: { viewerId } }]
        }
      })
    }

    for (const [q, v] of Object.entries(query)) {
      if (!q.startsWith('$')) {
        const field = Object.hasOwn(mappings.properties ?? {}, q) ? q : `${q}.keyword`
        if (typeof v === 'object') {
          if (v.$in !== undefined) {
            request.bool.should.push({
              terms: {
                [field]: v.$in,
                boost: 100.0
              }
            })
          }
        } else {
          request.bool.should.push({
            term: {
              [field]: {
                value: v,
                boost: 100.0,
                case_insensitive: true
              }
            }
          })
        }
      }
    }

    try {
      const result = await ctx.with(
        'search',
        {},
        () =>
          this.client.search({
            index: this.indexName,
            query: request,
            size: size ?? 200,
            from: from ?? 0
          }),
        {
          _classes,
          size,
          from,
          query: request
        }
      )
      const hits = (result.hits?.hits as any[]) ?? []
      return hits.map((hit) => ({ ...hit._source, _score: hit._score }))
    } catch (err: any) {
      if (err.name === 'ConnectionError') {
        ctx.warn('Elastic DB is not available')
        return []
      }
      ctx.error('Elastic error', { error: err })
      Analytics.handleError(err)
      return []
    }
  }

  private getTerms (values: string[], field: string, extra: any = {}): any {
    return {
      [Object.hasOwn(mappings.properties ?? {}, field) ? field : `${field}.keyword`]: values,
      ...extra
    }
  }

  async index (ctx: MeasureContext, workspaceId: WorkspaceUuid, doc: IndexedDoc): Promise<TxResult> {
    const wsDoc = {
      workspaceId,
      ...doc
    }
    const internalId = doc.viewerId != null ? (`${doc.id}_${doc.viewerId}` as Ref<Doc>) : doc.id
    const fulltextId = this.getFulltextDocId(workspaceId, internalId)
    if (doc.data === undefined) {
      await this.client.index({
        index: this.indexName,
        id: fulltextId,
        document: wsDoc
      })
    } else {
      await this.client.index({
        index: this.indexName,
        id: fulltextId,
        pipeline: 'attachment',
        document: wsDoc
      })
    }
    return {}
  }

  async update (
    ctx: MeasureContext,
    workspaceId: WorkspaceUuid,
    id: Ref<Doc>,
    update: Record<string, any>
  ): Promise<TxResult> {
    await this.client.update({
      index: this.indexName,
      id: this.getFulltextDocId(workspaceId, id),
      doc: update
    })

    return {}
  }

  async updateMany (ctx: MeasureContext, workspaceId: WorkspaceUuid, docs: IndexedDoc[]): Promise<TxResult[]> {
    const parts = Array.from(docs)
    while (parts.length > 0) {
      const part = parts.splice(0, 500)

      const operations = part.flatMap((doc) => {
        const wsDoc = { workspaceId, ...doc }
        const internalId = doc.viewerId != null ? (`${doc.id}_${doc.viewerId}` as Ref<Doc>) : doc.id
        const fulltextId = this.getFulltextDocId(workspaceId, internalId)
        return [{ index: { _index: this.indexName, _id: fulltextId } }, { ...wsDoc }]
      })

      const response = await this.client.bulk({ refresh: true, operations })
      if (response.errors) {
        const errors = response.items.filter((it) => it.index?.error !== undefined)
        const errorIds = new Set(errors.map((it) => it.index?._id).filter(notEmpty))
        const erroDocs = docs.filter((it) => errorIds.has(it.id))
        // Collect only errors
        const errs = Array.from(
          errors.map((it) => {
            return `${it.index?.error?.reason ?? ''}: ${it.index?.error?.caused_by?.reason ?? ''}`
          })
        ).join('\n')

        console.error(`Failed to process bulk request: ${errs} ${JSON.stringify(erroDocs)}`)
      }
    }
    return []
  }

  async updateByQuery (
    ctx: MeasureContext,
    workspaceId: WorkspaceUuid,
    query: DocumentQuery<Doc>,
    update: Record<string, any>
  ): Promise<TxResult[]> {
    const elasticQuery: any = {
      bool: {
        must: [
          {
            term: {
              workspaceId
            }
          }
        ]
      }
    }

    for (const [q, v] of Object.entries(query)) {
      if (!q.startsWith('$')) {
        if (typeof v === 'object') {
          if (v.$in !== undefined) {
            elasticQuery.bool.must.push({
              terms: {
                [Object.hasOwn(mappings.properties ?? {}, q) ? q : `${q}.keyword`]: v.$in
              }
            })
          }
        } else {
          elasticQuery.bool.must.push({
            term: {
              [Object.hasOwn(mappings.properties ?? {}, q) ? q : `${q}.keyword`]: {
                value: v
              }
            }
          })
        }
      }
    }

    await this.client.updateByQuery({
      index: this.indexName,
      query: elasticQuery,
      script: {
        source:
          'for(int i = 0; i < params.updateFields.size(); i++) { ctx._source[params.updateFields[i].key] = params.updateFields[i].value }',
        params: {
          updateFields: Object.entries(update).map(([key, value]) => ({ key, value }))
        },
        lang: 'painless'
      }
    })
    return []
  }

  async remove (ctx: MeasureContext, workspaceId: WorkspaceUuid, docs: Ref<Doc>[]): Promise<void> {
    try {
      while (docs.length > 0) {
        const part = docs.splice(0, 5000)
        await this.client.deleteByQuery({
          index: this.indexName,
          query: {
            bool: {
              must: [
                {
                  terms: {
                    id: part,
                    boost: 1.0
                  }
                },
                {
                  term: {
                    workspaceId
                  }
                }
              ]
            }
          },
          max_docs: part.length
        })
      }
    } catch (e: any) {
      if (e instanceof esErr.ResponseError && e.meta.statusCode === 404) {
        return
      }
      throw e
    }
  }

  async removeByQuery (ctx: MeasureContext, workspaceId: WorkspaceUuid, query: DocumentQuery<Doc>): Promise<void> {
    const elasticQuery: any = {
      bool: {
        must: [
          {
            term: {
              workspaceId
            }
          }
        ]
      }
    }

    for (const [q, v] of Object.entries(query)) {
      if (!q.startsWith('$')) {
        if (typeof v === 'object') {
          if (v.$in !== undefined) {
            elasticQuery.bool.must.push({
              terms: {
                [Object.hasOwn(mappings.properties ?? {}, q) ? q : `${q}.keyword`]: v.$in
              }
            })
          }
        } else {
          elasticQuery.bool.must.push({
            term: {
              [Object.hasOwn(mappings.properties ?? {}, q) ? q : `${q}.keyword`]: {
                value: v
              }
            }
          })
        }
      }
    }
    try {
      await this.client.deleteByQuery({
        index: this.indexName,
        query: elasticQuery
      })
    } catch (e: any) {
      if (e instanceof esErr.ResponseError && e.meta.statusCode === 404) {
        return
      }
      throw e
    }
  }

  async clean (ctx: MeasureContext, workspaceId: WorkspaceUuid): Promise<void> {
    try {
      await this.client.deleteByQuery({
        index: this.indexName,
        query: {
          bool: {
            must: [
              {
                term: {
                  workspaceId
                }
              }
            ]
          }
        }
      })
    } catch (e: any) {
      if (e instanceof esErr.ResponseError && e.meta.statusCode === 404) {
        return
      }
      throw e
    }
  }

  async load (ctx: MeasureContext, workspaceId: WorkspaceUuid, docs: Ref<Doc>[]): Promise<IndexedDoc[]> {
    const resp = await this.client.search({
      index: this.indexName,
      query: {
        bool: {
          must: [
            {
              terms: {
                id: docs,
                boost: 1.0
              }
            },
            {
              term: {
                workspaceId
              }
            }
          ]
        }
      },
      size: docs.length
    })
    return Array.from(
      (resp.hits?.hits ?? []).map((hit: any) => ({ ...hit._source, id: this.getDocId(workspaceId, hit._id) }))
    )
  }
}

/**
 * @public
 */
export async function createElasticAdapter (url: string): Promise<FullTextAdapter> {
  const client = new Client({
    node: url
  })
  const indexBaseName = getIndexName()
  const indexVersion = getIndexVersion()

  return new ElasticAdapter(client, indexBaseName, indexVersion)
}
