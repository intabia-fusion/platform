<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import attachment, {
    formatBadge,
    getAttachmentCategory,
    type Attachment,
    type Drawing
  } from '@hcengineering/attachment'
  import core, { SortingOrder } from '@hcengineering/core'
  import type { DrawingData } from '@hcengineering/presentation'
  import { FileViewer, getClient } from '@hcengineering/presentation'
  import { themeStore } from '@hcengineering/ui'
  import { formatFileSize } from '@hcengineering/ui/kit'
  import type { ComponentProps } from 'svelte'

  import { isAttachment } from '../utils'
  import AudioPreview from './file/AudioPreview.svelte'

  export let value: Attachment

  export let fullSize = false
  export let navigation: ComponentProps<FileViewer>['navigation'] = undefined
  export let extraActions: ComponentProps<FileViewer>['extraActions'] = []

  export let fullWindow = false

  // The viewer always fills the window; the props still tell the popup host where to put it.
  void fullSize
  void fullWindow

  $: format = getAttachmentCategory(value.type, value.name).format
  $: kind = formatBadge(format, value.name).label
  // A file not sent yet has no date.
  $: sent = isAttachment(value) ? (value.createdOn ?? value.modifiedOn) : undefined
  $: subtitle = [
    kind,
    value.size > 0 ? formatFileSize(value.size, $themeStore.language) : undefined,
    sent != null && sent > 0
      ? new Date(sent).toLocaleString($themeStore.language, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : undefined
  ]
    .filter((it) => it != null)
    .join(' · ')

  $: drawingAvailable = value?.type?.startsWith('image/') && isAttachment(value)

  async function loadDrawings (): Promise<Drawing[]> {
    const client = getClient()
    const drawings = await client.findAll(
      attachment.class.Drawing,
      {
        parent: value.file,
        space: value.space
      },
      {
        sort: {
          createdOn: SortingOrder.Descending
        },
        limit: 1
      }
    )

    return Array.from(drawings ?? [])
  }

  async function createDrawing (data: DrawingData): Promise<DrawingData> {
    const client = getClient()
    const newId = await client.createDoc(attachment.class.Drawing, value.space, {
      parent: value.file,
      parentClass: core.class.Blob,
      content: data.content
    })
    const newDrawing = await client.findOne(attachment.class.Drawing, { _id: newId })
    if (newDrawing === undefined) {
      throw new Error('Unable to find just created drawing')
    }
    return newDrawing
  }
</script>

<!-- Paging swaps the file: drawings and their editing state belong to the one shown. -->
{#key value._id}
  <FileViewer
    file={value.file}
    name={value.name}
    metadata={value.metadata}
    contentType={value.type}
    props={{
      drawingAvailable,
      loadDrawings,
      createDrawing
    }}
    {subtitle}
    size={value.size}
    viewer={value.type.startsWith('audio/') ? { component: AudioPreview, props: { value } } : undefined}
    {navigation}
    {extraActions}
    on:close
  />
{/key}
