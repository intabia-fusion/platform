//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2024 Hardcore Engineering Inc.
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

import { type Attachment, type AttachmentValue, type DraftAttachment } from '@hcengineering/attachment'
import {
  type BlobMetadata,
  type Blob,
  type Class,
  type TxOperations as Client,
  type Data,
  type Doc,
  type Ref,
  type Space,
  type WithLookup,
  type BlobType,
  type TxCUD
} from '@hcengineering/core'
import { getResource, setPlatformStatus, unknownError } from '@hcengineering/platform'
import { type FileOrBlob, getClient, getPreviewAlignment, uploadFile } from '@hcengineering/presentation'
import { closeTooltip, showPopup, type PopupResult } from '@hcengineering/ui'
import view, { type AttributeApplierResult } from '@hcengineering/view'
import workbench, { type WidgetTab } from '@hcengineering/workbench'

import attachment from './plugin'
import AttachmentPreviewPopup from './components/AttachmentPreviewPopup.svelte'

export async function createAttachments (
  client: Client,
  list: FileList,
  attachTo: { objectClass: Ref<Class<Doc>>, space: Ref<Space>, objectId: Ref<Doc> },
  attachmentClass: Ref<Class<Attachment>> = attachment.class.Attachment,
  extraData: Partial<Data<Attachment>> = {}
): Promise<void> {
  try {
    for (let index = 0; index < list.length; index++) {
      const file = list.item(index)
      if (file !== null) {
        const { uuid, metadata } = await uploadFile(file)
        await createAttachment(client, uuid, file.name, file, metadata, attachTo, attachmentClass, extraData)
      }
    }
  } catch (err: any) {
    await setPlatformStatus(unknownError(err))
  }
}

export async function createAttachment (
  client: Client,
  uuid: Ref<Blob>,
  name: string,
  file: FileOrBlob,
  metadata: BlobMetadata,
  attachTo: { objectClass: Ref<Class<Doc>>, space: Ref<Space>, objectId: Ref<Doc> },
  attachmentClass: Ref<Class<Attachment>> = attachment.class.Attachment,
  extraData: Partial<Data<Attachment>> = {}
): Promise<void> {
  const { objectClass, objectId, space } = attachTo
  try {
    await client.addCollection(attachmentClass, space, objectId, objectClass, 'attachments', {
      ...extraData,
      name,
      file: uuid,
      type: file.type,
      size: file.size,
      lastModified: file instanceof File ? file.lastModified : Date.now(),
      metadata
    })
  } catch (err: any) {
    await setPlatformStatus(unknownError(err))
  }
}

export function getType (
  type: string
): 'image' | 'text' | 'json' | 'video' | 'audio' | 'pdf' | 'link-preview' | 'other' {
  if (type.startsWith('image/')) {
    return 'image'
  }
  if (type.startsWith('audio/')) {
    return 'audio'
  }
  if (type.startsWith('video/')) {
    return 'video'
  }
  if (type.includes('application/pdf')) {
    return 'pdf'
  }
  if (type.includes('application/json')) {
    return 'json'
  }
  if (type.startsWith('text/')) {
    return 'text'
  }
  if (type.includes('application/link-preview')) {
    return 'link-preview'
  }
  return 'other'
}

export async function openAttachmentInSidebar (value: Attachment | BlobType): Promise<void> {
  closeTooltip()
  await openFilePreviewInSidebar(value.file, value.name, value.type, value.metadata)
}

export async function openFilePreviewInSidebar (
  file: Ref<Blob>,
  name: string,
  contentType: string,
  metadata?: BlobMetadata
): Promise<void> {
  const client = getClient()
  const widget = client.getModel().findAllSync(workbench.class.Widget, { _id: attachment.ids.PreviewWidget })[0]
  const createFn = await getResource(workbench.function.CreateWidgetTab)
  let icon = attachment.icon.Attachment

  if (contentType.startsWith('image/')) {
    icon = view.icon.Image
  } else if (contentType.startsWith('video/')) {
    icon = view.icon.Video
  } else if (contentType.startsWith('audio/')) {
    icon = view.icon.Audio
  } else {
    icon = view.icon.File
  }

  const tab: WidgetTab = {
    id: file,
    icon,
    name,
    data: { file, name, contentType, metadata }
  }
  await createFn(widget, tab, true)
}

export function isAttachment (value: Attachment | BlobType): value is WithLookup<Attachment> {
  return (value as Attachment)._id !== undefined
}

export function showAttachmentPreviewPopup (
  value: WithLookup<Attachment> | BlobType,
  fullSize: boolean = true
): PopupResult {
  closeTooltip()
  return showPopup(AttachmentPreviewPopup, { value, fullSize }, getPreviewAlignment(value.type ?? ''))
}

interface ImageDimensions {
  width: number
  height: number
  fit: 'cover' | 'contain'
}

export function getImageDimensions (
  size: { width: number, height: number },
  maxRem: { maxWidth: number, minWidth: number, maxHeight: number, minHeight: number },
  options?: { ignoreMinHeight?: boolean, forceFit?: 'contain' | 'cover' }
): ImageDimensions {
  const originalWidth = size.width
  const originalHeight = size.height
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize)
  let maxWidthPx = maxRem.maxWidth * fontSize
  const minWidthPx = maxRem.minWidth * fontSize
  let maxHeightPx = maxRem.maxHeight * fontSize
  const minHeightPx = maxRem.minHeight * fontSize

  const ratio = originalHeight / originalWidth

  // Square-ish images (logos) get a tighter cap so they don't dominate the message
  const SQUARE_CAP_REM = 6
  if (ratio >= 0.85 && ratio <= 1.18) {
    const squareCapPx = SQUARE_CAP_REM * fontSize
    maxWidthPx = Math.min(maxWidthPx, squareCapPx)
    maxHeightPx = Math.min(maxHeightPx, squareCapPx)
  }

  let width = Math.min(originalWidth, maxWidthPx)
  let height = Math.ceil(width * ratio)

  const fit = options?.forceFit ?? (width < minWidthPx || height < minHeightPx ? 'cover' : 'contain')

  if (height > maxHeightPx) {
    width = maxHeightPx / ratio
    height = maxHeightPx
  } else if (height < minHeightPx && !(options?.ignoreMinHeight ?? false)) {
    height = minHeightPx
  }

  return { width: Math.round(width), height: Math.round(height), fit }
}

export const savedBlobs = new Set<string>()

export async function attachmentsApplier (
  doc: Doc,
  value: AttachmentValue[] | undefined
): Promise<AttributeApplierResult> {
  if (!Array.isArray(value)) return {}

  const client = getClient()
  const txes: Array<TxCUD<Doc>> = []

  for (const item of value) {
    const fileId = typeof item === 'string' ? item : item?.file
    if (fileId != null) {
      savedBlobs.add(fileId)
    }
  }

  const existing = (await client.findAll(attachment.class.Attachment, { attachedTo: doc._id })) as Attachment[]
  const existingFileIds = new Set(existing.map((it) => it.file))

  for (const item of value) {
    if (typeof item === 'string') {
      const blobRef = item as any
      if (!existingFileIds.has(blobRef) && !existing.some((e) => e._id === blobRef)) {
        const createTx = client.txFactory.createTxCreateDoc<Attachment>(attachment.class.Attachment, doc.space, {
          name: 'Attachment',
          file: blobRef,
          size: 0,
          type: '',
          lastModified: Date.now(),
          attachedTo: doc._id,
          attachedToClass: doc._class,
          collection: 'attachments'
        })
        const tx = client.txFactory.createTxCollectionCUD(doc._class, doc._id, doc.space, 'attachments', createTx)
        txes.push(tx)
      }
    } else if (typeof item === 'object' && item != null) {
      const att = item as DraftAttachment
      const blobRef = att.file
      if (blobRef != null && !existingFileIds.has(blobRef)) {
        const createTx = client.txFactory.createTxCreateDoc<Attachment>(attachment.class.Attachment, doc.space, {
          name: att.name ?? 'Attachment',
          file: blobRef,
          size: att.size ?? 0,
          type: att.type ?? '',
          lastModified: Date.now(),
          attachedTo: doc._id,
          attachedToClass: doc._class,
          collection: 'attachments'
        })
        const tx = client.txFactory.createTxCollectionCUD(doc._class, doc._id, doc.space, 'attachments', createTx)
        txes.push(tx)
      }
    }
  }

  const valueFiles = new Set(
    value.map((v) => (typeof v === 'string' ? v : (v as DraftAttachment)?.file)).filter(Boolean)
  )
  const valueIds = new Set(value.map((v) => (typeof v === 'string' ? v : (v as DraftAttachment)?._id)).filter(Boolean))

  for (const existingAtt of existing) {
    if (!valueFiles.has(existingAtt.file) && !valueIds.has(existingAtt._id)) {
      const removeTx = client.txFactory.createTxRemoveDoc(
        attachment.class.Attachment,
        existingAtt.space,
        existingAtt._id
      )
      const tx = client.txFactory.createTxCollectionCUD(doc._class, doc._id, doc.space, 'attachments', removeTx)
      txes.push(tx)
    }
  }

  return { txes }
}
