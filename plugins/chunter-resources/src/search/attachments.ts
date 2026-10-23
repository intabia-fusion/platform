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

import activity from '@hcengineering/activity'
import aiBot from '@hcengineering/ai-bot'
import attachment, {
  attachmentFacet,
  attachmentFormats,
  AttachmentFormat,
  AttachmentKind,
  getAttachmentCategory,
  LINK_PREVIEW_TYPE,
  type Attachment
} from '@hcengineering/attachment'
import chunter, { chatMessageFacet, type ChatMessage } from '@hcengineering/chunter'
import { type Person } from '@hcengineering/contact'
import {
  type Blob,
  type Class,
  type Doc,
  type Hierarchy,
  type Markup,
  notEmpty,
  type PersonId,
  type Ref,
  type SearchFilters,
  type SearchResultDoc,
  type SearchSortOrder,
  type Timestamp
} from '@hcengineering/core'
import { getClient, type LinkPreviewAttachmentMetadata } from '@hcengineering/presentation'
import { EmptyMarkup, extractLinks, markupToJSON, type MarkupLink } from '@hcengineering/text-core'

import { shownOrder } from './browser'
import { expandClasses } from './classes'
import { matchedTerms } from './highlight'
import { hydratePlaces } from './hydrate'
import { createPagedSearch, type PagedSearchRequest, type PagedSearchStore } from './paged'
import { authorOf, isThreadClass, personsOf, trimmed } from './rows'
import type { ChatSearchFilters } from './types'

export enum BrowserTab {
  Messages = 'messages',
  Media = 'media',
  Files = 'files',
  Links = 'links',
  Audio = 'audio'
}

export type AttachmentTab = BrowserTab.Media | BrowserTab.Files | BrowserTab.Audio

export type ContentTab = AttachmentTab | BrowserTab.Links

export const attachmentTabs: AttachmentTab[] = [BrowserTab.Media, BrowserTab.Files, BrowserTab.Audio]

export const tabKind: Record<AttachmentTab, AttachmentKind> = {
  [BrowserTab.Media]: AttachmentKind.Media,
  [BrowserTab.Files]: AttachmentKind.File,
  [BrowserTab.Audio]: AttachmentKind.Audio
}

export function isAttachmentTab (tab: BrowserTab): tab is AttachmentTab {
  return (attachmentTabs as BrowserTab[]).includes(tab)
}

const kindTab: Record<AttachmentKind, BrowserTab> = {
  [AttachmentKind.Media]: BrowserTab.Media,
  [AttachmentKind.File]: BrowserTab.Files,
  [AttachmentKind.Audio]: BrowserTab.Audio,
  [AttachmentKind.Link]: BrowserTab.Links
}

export function mainTabOf (hierarchy: Hierarchy, attachments: Attachment[]): BrowserTab {
  const counts = new Map<BrowserTab, number>()
  for (const a of attachments) {
    const voice = hierarchy.hasClass(a._class) && hierarchy.isDerived(a._class, aiBot.class.AudioTranscribe)
    const tab = kindTab[getAttachmentCategory(a.type, a.name, voice).kind]
    counts.set(tab, (counts.get(tab) ?? 0) + 1)
  }
  let best: BrowserTab = BrowserTab.Files
  for (const [tab, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = tab
  }
  return best
}

export interface BrowserFilters extends ChatSearchFilters {
  formats?: AttachmentFormat[]
  content?: boolean
}

// A grid row is three to eight tiles wide, so a page fills a screen or two whatever the width.
export const MEDIA_PAGE_SIZE = 60
export const LIST_PAGE_SIZE = 40

export interface AttachmentRow {
  _id: Ref<Attachment>
  attachment: Attachment
  format: AttachmentFormat
  poster?: Ref<Blob>
  durationSec?: number
  transcript?: string
  message: { _id: Ref<ChatMessage>, _class: Ref<Class<ChatMessage>> }
  channel: string
  thread: boolean
  attachedPerson?: Person
  person?: Person
  createdOn: Timestamp
  nameHighlight?: string
  /** Excerpts of a transcript that matched; a document only says that its text did. */
  contentHighlights: string[]
  raw: SearchResultDoc
}

export interface LinkPreview {
  url?: string
  title?: string
  description?: string
  image?: string
}

export interface LinkRow {
  _id: Ref<ChatMessage>
  _class: Ref<Class<ChatMessage>>
  markup: Markup
  links: MarkupLink[]
  previews: LinkPreview[]
  channel: string
  thread: boolean
  attachedPerson?: Person
  person?: Person
  createdOn: Timestamp
  highlights: string[]
  // Words the index matched in the addresses and page titles, which it returns apart from the text.
  extraTerms: string[]
  raw: SearchResultDoc
}

const ATTACHMENT_FIELDS = ['name', 'file', 'type', 'size', 'metadata', 'lastModified', 'durationSec', 'text', 'hls']

function concreteDescendants (hierarchy: Hierarchy, _class: Ref<Class<Doc>>): Array<Ref<Class<Doc>>> {
  return hierarchy.getDescendants(_class).filter((c) => !hierarchy.isMixin(c))
}

export function placeFilters (filters: ChatSearchFilters): SearchFilters {
  const result: SearchFilters = {}
  if (filters.authors !== undefined && filters.authors.length > 0) {
    result.createdBy = filters.authors.flatMap((a) => a.socialIds)
  }
  if (filters.after !== undefined) result.createdAfter = filters.after
  if (filters.before !== undefined) result.createdBefore = filters.before

  // Matches both a file hanging off a message and the chat that message lives in.
  if (filters.attachedTo !== undefined && filters.attachedTo.length > 0) {
    result.attachedTo = filters.attachedTo.map((o) => o._id)
  }
  // "Thread replies" names no place for an attachment and would match nothing.
  const classes = (filters.attachedToClasses ?? []).filter((c) => c !== activity.class.ActivityMessage)
  if (classes.length > 0) {
    result.rootObjectClass = expandClasses(classes)
  }
  return result
}

export function attachmentSearchRequest (
  tab: AttachmentTab,
  search: string,
  filters: BrowserFilters,
  sort: SearchSortOrder
): PagedSearchRequest {
  const hierarchy = getClient().getHierarchy()

  const facets = [[attachmentFacet.kind(tabKind[tab])]]
  const allowed = new Set(filters.formats ?? [])
  if (allowed.size > 0) {
    facets.push(Array.from(allowed).map((f) => attachmentFacet.format(f)))
  }

  return {
    query: {
      query: search,
      // Nothing typed: the feed of the tab, every file its filters let through.
      allowEmptyQuery: true,
      classes: concreteDescendants(hierarchy, attachment.class.Attachment),
      filters: {
        ...placeFilters(filters),
        attachedToClass: concreteDescendants(hierarchy, chunter.class.ChatMessage),
        facets
      }
    },
    sort: shownOrder(sort, search),
    options: {
      // `content` is the name of a file and the transcript of a recording, `extra` the text inside a document.
      searchIn:
        tab === BrowserTab.Files && filters.content === true ? ['title', 'content', 'extra'] : ['title', 'content'],
      highlight: search !== '',
      fields: ATTACHMENT_FIELDS
    }
  }
}

export function linkSearchRequest (
  search: string,
  filters: ChatSearchFilters,
  sort: SearchSortOrder
): PagedSearchRequest {
  const hierarchy = getClient().getHierarchy()
  return {
    query: {
      query: search,
      allowEmptyQuery: true,
      classes: concreteDescendants(hierarchy, chunter.class.ChatMessage),
      filters: {
        ...placeFilters(filters),
        facets: [[chatMessageFacet.link]]
      }
    },
    sort: shownOrder(sort, search),
    options: {
      searchIn: ['content', 'extra'],
      highlight: search !== '',
      fields: ['message', 'attachments']
    }
  }
}

export async function hydrateAttachments (docs: SearchResultDoc[]): Promise<AttachmentRow[]> {
  const hierarchy = getClient().getHierarchy()
  const [persons, placeInfo] = await Promise.all([personsOf(docs), hydratePlaces(docs)])

  return docs
    .map((d): AttachmentRow | undefined => {
      const fields = d.fields
      if (fields?.file === undefined || d.doc.attachedTo == null || d.doc.attachedToClass == null) return undefined

      const doc: Attachment = {
        _id: d.doc._id as Ref<Attachment>,
        _class: d.doc._class as Ref<Class<Attachment>>,
        space: d.doc.space as Attachment['space'],
        modifiedOn: d.doc.modifiedOn ?? 0,
        modifiedBy: d.doc.modifiedBy as PersonId,
        createdOn: d.doc.createdOn,
        createdBy: d.doc.createdBy,
        attachedTo: d.doc.attachedTo,
        attachedToClass: d.doc.attachedToClass,
        collection: 'attachments',
        name: fields.name ?? '',
        file: fields.file,
        size: fields.size ?? 0,
        type: fields.type ?? '',
        lastModified: fields.lastModified ?? 0,
        metadata: fields.metadata
      }
      const voice = hierarchy.hasClass(doc._class) && hierarchy.isDerived(doc._class, aiBot.class.AudioTranscribe)
      const { channel, attachedPerson } = placeInfo(d)

      return {
        _id: doc._id,
        attachment: doc,
        format: getAttachmentCategory(doc.type, doc.name, voice).format,
        // The media pod once wrote the stream info next to `metadata`, not into it; both are read.
        poster: fields.hls?.thumbnail ?? fields.metadata?.hls?.thumbnail,
        // A voice note keeps its length on the document, a video in `metadata`.
        durationSec: fields.durationSec ?? fields.metadata?.durationSec,
        transcript: fields.text,
        message: {
          _id: d.doc.attachedTo as Ref<ChatMessage>,
          _class: d.doc.attachedToClass as Ref<Class<ChatMessage>>
        },
        channel,
        thread: isThreadClass(hierarchy, doc.attachedToClass),
        attachedPerson,
        person: authorOf(d, persons),
        createdOn: d.doc.createdOn ?? 0,
        nameHighlight: d.highlights?.title?.[0],
        contentHighlights: voice ? trimmed(d.highlights?.content) : [],
        raw: d
      }
    })
    .filter(notEmpty)
}

function filled (value: string | undefined): string | undefined {
  return value != null && value !== '' ? value : undefined
}

// In the form `extractLinks` gives, so a preview finds the link of the message it was made from.
function normalUrl (value: string | undefined): string | undefined {
  if (value == null) return undefined
  try {
    return new URL(value).toString()
  } catch {
    return undefined
  }
}

function toPreview (metadata: LinkPreviewAttachmentMetadata | undefined): LinkPreview | undefined {
  if (metadata == null) return undefined
  const preview: LinkPreview = {
    url: normalUrl(metadata.url),
    title: filled(metadata.title),
    description: filled(metadata.description),
    image: filled(metadata.image)
  }
  return preview.title != null || preview.image != null ? preview : undefined
}

export async function hydrateLinks (docs: SearchResultDoc[]): Promise<LinkRow[]> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  // A preview is an attachment of the message, so only those carrying some can have one.
  const withAttachments = docs.filter((d) => (d.fields?.attachments ?? 0) > 0).map((d) => d.doc._id)

  const [persons, placeInfo, previews] = await Promise.all([
    personsOf(docs),
    hydratePlaces(docs),
    withAttachments.length > 0
      ? client.findAll(
          attachment.class.Attachment,
          { attachedTo: { $in: withAttachments }, type: LINK_PREVIEW_TYPE },
          { projection: { _id: 1, attachedTo: 1, metadata: 1 } }
        )
      : []
  ])

  const previewsOf = new Map<Ref<Doc>, LinkPreview[]>()
  for (const p of previews) {
    const preview = toPreview(p.metadata as LinkPreviewAttachmentMetadata | undefined)
    if (preview === undefined) continue
    previewsOf.set(p.attachedTo, [...(previewsOf.get(p.attachedTo) ?? []), preview])
  }

  return docs
    .map((d): LinkRow | undefined => {
      const markup: Markup = d.fields?.message ?? EmptyMarkup
      let links: MarkupLink[] = []
      try {
        links = extractLinks(markupToJSON(markup))
      } catch (err: any) {
        console.error('failed to read message links', err)
      }
      if (links.length === 0) return undefined

      const { channel, attachedPerson } = placeInfo(d)
      return {
        _id: d.id as Ref<ChatMessage>,
        _class: d.doc._class as Ref<Class<ChatMessage>>,
        markup,
        links,
        previews: previewsOf.get(d.id) ?? [],
        channel,
        thread: isThreadClass(hierarchy, d.doc._class),
        attachedPerson,
        person: authorOf(d, persons),
        createdOn: d.doc.createdOn ?? 0,
        highlights: trimmed(d.highlights?.content),
        extraTerms: matchedTerms(d.highlights?.extra ?? []),
        raw: d
      }
    })
    .filter(notEmpty)
}

export type AttachmentSearchStore = PagedSearchStore<AttachmentRow, BrowserFilters>
export type LinkSearchStore = PagedSearchStore<LinkRow, ChatSearchFilters>

export interface BrowserSearchStart<Filters> {
  search: string
  filters: Filters
  sort: SearchSortOrder
}

export function createAttachmentSearchStore (
  tab: AttachmentTab,
  start: BrowserSearchStart<BrowserFilters>
): AttachmentSearchStore {
  return createPagedSearch<AttachmentRow, BrowserFilters>({
    ...start,
    pageSize: tab === BrowserTab.Media ? MEDIA_PAGE_SIZE : LIST_PAGE_SIZE,
    debounceMs: 300,
    request: (search, filters, sort) => attachmentSearchRequest(tab, search, filters, sort),
    hydrate: hydrateAttachments
  })
}

export function createLinkSearchStore (start: BrowserSearchStart<ChatSearchFilters>): LinkSearchStore {
  return createPagedSearch<LinkRow, ChatSearchFilters>({
    ...start,
    pageSize: LIST_PAGE_SIZE,
    debounceMs: 300,
    request: linkSearchRequest,
    hydrate: hydrateLinks
  })
}

export function tabFormats (tab: AttachmentTab): AttachmentFormat[] {
  return attachmentFormats[tabKind[tab]]
}
