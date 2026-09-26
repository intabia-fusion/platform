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

import chunter, { type ChunterSpace } from '@hcengineering/chunter'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import { decodeObjectURI } from '@hcengineering/view'
import slugify from 'slugify'

const generatedId = /^[0-9a-f]{24}$/
const modelSpaceId = /^([a-z0-9-]+):space:([A-Za-z0-9]+)$/
const modelSpaceLinkId = /^([a-z0-9-]+)-space-([A-Za-z0-9]+)$/

export function toChunterSpaceLinkId (_id: string, name: string): string {
  // Model channels (`chunter:space:General`) already carry a name, only the colons are replaced.
  if (modelSpaceId.test(_id)) return _id.replace(modelSpaceId, '$1-space-$2')
  if (!generatedId.test(_id)) return _id
  const slug = slugify(name, { lower: true, strict: true })
  return slug === '' ? _id : `${slug}-${_id}`
}

// Accepts `<name>-<id>`, `chunter-space-General` and bare ids from links made before the slug.
export function parseChunterSpaceLinkId (id: string): Ref<ChunterSpace> {
  // The hex tail goes first: a slug such as `my-space-<id>` also fits the model pattern.
  const generated = id.match(/(?:^|-)([0-9a-f]{24})$/)?.[1]
  if (generated !== undefined) return generated as Ref<ChunterSpace>
  return (modelSpaceLinkId.test(id) ? id.replace(modelSpaceLinkId, '$1:space:$2') : id) as Ref<ChunterSpace>
}

export function decodeChatURI (value: string | undefined): [Ref<Doc>, Ref<Class<Doc>>] {
  const decoded = decodeURIComponent(value ?? '')
  // Old `<id>|<class>` links, channels and directs included, keep resolving as before.
  if (decoded === '' || decoded.includes('|')) return decodeObjectURI(decoded)
  // The concrete class comes with the loaded doc.
  return [decoded as Ref<Doc>, chunter.class.ChunterSpace]
}
