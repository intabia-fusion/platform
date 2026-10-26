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

import { AttachmentFormat } from '@hcengineering/attachment'
import { type Class, type Doc, type Ref, type SearchSortOrder } from '@hcengineering/core'
import { type Person } from '@hcengineering/contact'
import { getClient } from '@hcengineering/presentation'
import { getDocIdentifier, getDocTitle } from '@hcengineering/view-resources'

import { BrowserTab } from './attachments'
import { pickAuthors } from './resolve'
import type { ChatSearchFilters, PickedObject } from './types'

type UrlQuery = Record<string, string | null> | undefined

const SORTS: SearchSortOrder[] = ['relevance', 'date-desc', 'date-asc']
const TABS = Object.values(BrowserTab)
const FORMATS = new Set<string>(Object.values(AttachmentFormat))

// Every key the browser writes: a link with any of them names a search.
const SEARCH_KEYS = [
  'q',
  'type',
  'from',
  'in',
  'after',
  'before',
  'files',
  'transcripts',
  'sort',
  'tab',
  'formats',
  'content'
]

export interface BrowserSearch {
  tab: BrowserTab
  query: string
  filters: ChatSearchFilters
  sort: SearchSortOrder
  formats: AttachmentFormat[]
  content: boolean
}

/** Relevance needs a query; the file tabs open as a feed, newest first. */
export function defaultSort (tab: BrowserTab): SearchSortOrder {
  return tab === BrowserTab.Messages ? 'relevance' : 'date-desc'
}

export function namesSearch (query: UrlQuery): boolean {
  return SEARCH_KEYS.some((key) => query?.[key] != null)
}

export function tabFromQuery (query: UrlQuery): BrowserTab | undefined {
  const tab = query?.tab
  return TABS.includes(tab as BrowserTab) ? (tab as BrowserTab) : undefined
}

/** A link naming a search is a message search unless it names a tab; a plain one opens the last tab. */
export function startTab (query: UrlQuery, saved: () => BrowserTab): BrowserTab {
  return tabFromQuery(query) ?? (namesSearch(query) ? BrowserTab.Messages : saved())
}

export function formatsFromQuery (query: UrlQuery): AttachmentFormat[] {
  return split(query?.formats).filter((it): it is AttachmentFormat => FORMATS.has(it))
}

/** The URL of a search: what equals the default is left out, so a plain browser keeps a plain address. */
export function searchToQuery (search: BrowserSearch): Record<string, string> {
  const query = filtersToQuery(search.filters)
  if (search.query !== '') query.q = search.query
  if (search.sort !== defaultSort(search.tab)) query.sort = search.sort
  if (search.tab !== BrowserTab.Messages) query.tab = search.tab
  if (search.formats.length > 0) query.formats = search.formats.join(',')
  if (search.content) query.content = '1'
  return query
}

/** The other parameters of the page stay; those of the previous search go. */
export function replaceSearch (current: UrlQuery, search: Record<string, string>): Record<string, string | null> {
  const rest = Object.entries(current ?? {}).filter(([key]) => !SEARCH_KEYS.includes(key))
  return { ...Object.fromEntries(rest), ...search }
}

function join (values: string[]): string | undefined {
  return values.length > 0 ? values.join(',') : undefined
}

function split (value: string | null | undefined): string[] {
  if (value == null || value === '') return []
  return value.split(',').filter((v) => v !== '')
}

function filtersToQuery (filters: ChatSearchFilters): Record<string, string> {
  const query: Record<string, string> = {}

  const classes = join(filters.attachedToClasses ?? [])
  if (classes !== undefined) query.type = classes

  const authors = join((filters.authors ?? []).map((a) => a.person))
  if (authors !== undefined) query.from = authors

  const objects = join((filters.attachedTo ?? []).map((o) => `${o._class}~${o._id}`))
  if (objects !== undefined) query.in = objects

  if (filters.after !== undefined) query.after = `${filters.after}`
  if (filters.before !== undefined) query.before = `${filters.before}`
  if (filters.hasAttachment === true) query.files = '1'
  if (filters.includeTranscription === true) query.transcripts = '1'

  return query
}

function toNumber (value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return isNaN(parsed) ? undefined : parsed
}

export function sortFromQuery (query: UrlQuery): SearchSortOrder | undefined {
  const value = query?.sort
  return SORTS.includes(value as SearchSortOrder) ? (value as SearchSortOrder) : undefined
}

export async function filtersFromQuery (query: UrlQuery): Promise<ChatSearchFilters> {
  if (query === undefined) return {}

  const filters: ChatSearchFilters = {}

  const classes = split(query.type) as Array<Ref<Class<Doc>>>
  if (classes.length > 0) filters.attachedToClasses = classes

  const persons = split(query.from) as Array<Ref<Person>>
  if (persons.length > 0) {
    const authors = await pickAuthors(persons)
    if (authors.length > 0) filters.authors = authors
  }

  const refs = split(query.in)
    .map((pair) => {
      const at = pair.indexOf('~')
      if (at <= 0) return undefined
      return { _class: pair.slice(0, at) as Ref<Class<Doc>>, _id: pair.slice(at + 1) as Ref<Doc> }
    })
    .filter((r): r is { _class: Ref<Class<Doc>>, _id: Ref<Doc> } => r !== undefined)
  if (refs.length > 0) {
    const objects = await resolveObjects(refs)
    if (objects.length > 0) filters.attachedTo = objects
  }

  const after = toNumber(query.after)
  if (after !== undefined) filters.after = after
  const before = toNumber(query.before)
  if (before !== undefined) filters.before = before

  if (query.files === '1') filters.hasAttachment = true
  if (query.transcripts === '1') filters.includeTranscription = true

  return filters
}

/** Filters of a link, or none when they fail to load: the browser must open either way. */
export async function filtersFromLink (query: UrlQuery): Promise<ChatSearchFilters> {
  try {
    return await filtersFromQuery(query)
  } catch (err) {
    console.error('failed to restore search filters', err)
    return {}
  }
}

async function resolveObjects (refs: Array<{ _class: Ref<Class<Doc>>, _id: Ref<Doc> }>): Promise<PickedObject[]> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  // One object whose title fails to load drops only itself.
  const found = await Promise.allSettled(
    refs.map(async ({ _class, _id }): Promise<PickedObject | undefined> => {
      if (!hierarchy.hasClass(_class)) return undefined

      const doc = await client.findOne<Doc>(_class, { _id })
      if (doc === undefined) return undefined

      const [title, identifier] = await Promise.all([
        getDocTitle(client, _id, _class, doc),
        getDocIdentifier(client, _id, _class, doc)
      ])
      if (title === undefined || title === '') return undefined

      return { _id, _class, title, identifier, icon: hierarchy.getClass(_class).icon, doc }
    })
  )

  return found.flatMap((r) => (r.status === 'fulfilled' && r.value != null ? [r.value] : []))
}
