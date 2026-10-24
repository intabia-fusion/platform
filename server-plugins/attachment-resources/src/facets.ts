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

import aiBot from '@hcengineering/ai-bot'
import { attachmentFacet, AttachmentFormat, getAttachmentCategory, type Attachment } from '@hcengineering/attachment'
import type { Doc, Hierarchy } from '@hcengineering/core'
import type { SearchFacets } from '@hcengineering/server-core'

/**
 * @public
 */
export function AttachmentSearchFacets (doc: Doc, hierarchy: Hierarchy): SearchFacets {
  const attachment = doc as Attachment
  const voice = hierarchy.isDerived(attachment._class, aiBot.class.AudioTranscribe)
  const { kind, format } = getAttachmentCategory(attachment.type, attachment.name ?? '', voice)
  const values = [attachmentFacet.kind(kind), attachmentFacet.format(format)]

  // Its name is a random id; the title and description are what a person remembers.
  if (format === AttachmentFormat.LinkPreview) {
    const extra = [attachment.metadata?.title, attachment.metadata?.description]
      .filter((it): it is string => typeof it === 'string' && it !== '')
      .join('\n')
    return { values, extra }
  }

  return { values }
}
