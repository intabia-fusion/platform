<!--
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
-->
<script lang="ts">
  import { formatBadge, getAttachmentCategory, type Attachment } from '@hcengineering/attachment'
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import { getFileUrl } from '@hcengineering/presentation'
  import { FileCard } from '@hcengineering/ui/kit'

  import { isAttachment, showAttachmentPreviewPopup } from '../../utils'
  import { pageImage, pictureImage } from './blob'
  import { showAttachmentMenu } from './menu'

  export let value: WithLookup<Attachment> | BlobType
  export let isSaved: boolean = false
  export let removable: boolean = false
  export let withActions: boolean = true
  export let openViewer: ((value: Attachment) => void) | undefined = undefined

  let menuOpen = false

  $: format = getAttachmentCategory(value.type, value.name).format

  function open (): void {
    if (openViewer != null && isAttachment(value)) openViewer(value)
    else showAttachmentPreviewPopup(value)
  }
</script>

<FileCard
  name={value.name}
  size={value.size}
  badge={formatBadge(format, value.name)}
  picture={pictureImage(format, value.file, value.name)}
  page={pageImage(format, value.file, value.name)}
  url={getFileUrl(value.file, value.name)}
  contentType={value.type}
  cacheKey={value.file}
  highlighted={menuOpen}
  on:open={open}
  on:contextmenu={(e) => {
    if (!withActions) return
    menuOpen = true
    showAttachmentMenu(e.detail, value, { isSaved, removable, onClose: () => (menuOpen = false) })
  }}
/>
