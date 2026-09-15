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

import type {
  Class,
  Doc,
  Markup,
  PersonId,
  Ref,
  SearchResultDoc,
  SearchSortOrder,
  Space,
  Timestamp
} from '@hcengineering/core'
import type { Asset } from '@hcengineering/platform'
import type { Person } from '@hcengineering/contact'
import { ChatMessage } from '@hcengineering/chunter'

export interface PickedObject {
  _id: Ref<Doc>
  _class: Ref<Class<Doc>>
  title: string
  identifier?: string
  icon?: Asset
  doc?: Doc
}

export interface PickedAuthor {
  person: Ref<Person>
  socialIds: PersonId[]
}

export interface ChatSearchFilters {
  attachedToClasses?: Array<Ref<Class<Doc>>>
  /** A person plus the social ids the index actually stores against `createdBy`. Kept together
   * so the two can never drift apart: one names the author, the other finds their messages. */
  authors?: PickedAuthor[]
  attachedTo?: PickedObject[]
  after?: number
  before?: number
  hasAttachment?: boolean
  /** Meeting transcriptions are excluded unless asked for: they are long and noisy. */
  includeTranscription?: boolean
}

export interface SearchResultRow {
  _id: Ref<ChatMessage>
  _class: Ref<Class<ChatMessage>>
  channel: string
  createdOn: Timestamp
  attachedToClass: Ref<Class<Doc>>
  attachedTo: Ref<Doc>
  highlights: string[]
  markup: Markup
  person?: Person
  raw: SearchResultDoc
}

export interface ChatSearchState {
  search: string
  filters: ChatSearchFilters
  sort: SearchSortOrder
  results: SearchResultRow[]
  total?: number
  totalExact?: boolean
  loading: boolean
  loadingMore: boolean
  done: boolean
  failure?: SearchFailure
}

export type SearchFailure = { kind: 'unavailable' } | { kind: 'error', message: string }

export interface ChatSearchScope {
  space?: Ref<Space>
  attachedTo?: Ref<Doc>
}
