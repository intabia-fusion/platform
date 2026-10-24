<!--
// Copyright © 2022, 2025 Hardcore Engineering Inc.
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
  import type { Attachment } from '@hcengineering/attachment'
  import type { BlobMetadata, Class, Doc, Markup, Ref, Space, TxOperations } from '@hcengineering/core'
  import { type Blob, toIdMap } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { setPlatformStatus, unknownError } from '@hcengineering/platform'
  import type { FileOrBlob } from '@hcengineering/presentation'
  import {
    createQuery,
    deleteFile,
    DraftController,
    draftsStore,
    getClient,
    uploadFile
  } from '@hcengineering/presentation'
  import { EmptyMarkup } from '@hcengineering/text'
  import textEditor, { type RefAction } from '@hcengineering/text-editor'
  import type { EditorKitOptions } from '@hcengineering/text-editor-resources'
  import { AttachIcon, StyledTextBox } from '@hcengineering/text-editor-resources'
  import type { ButtonSize } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import attachment from '../plugin'
  import AttachmentsGrid from './AttachmentsGrid.svelte'
  import { dropFiles, droppedFiles, pickedFiles } from './file/drop'
  import { UploadQueue, draftAttachment } from './file/uploads'

  export let objectId: Ref<Doc> | undefined = undefined
  export let space: Ref<Space> | undefined = undefined
  export let _class: Ref<Class<Doc>> | undefined = undefined
  export let content: Markup = EmptyMarkup
  export let placeholder: IntlString | undefined = undefined
  export let alwaysEdit = false
  export let showButtons = false
  export let kind: 'normal' | 'emphasized' | 'indented' = 'normal'
  export let buttonSize: ButtonSize = 'medium'
  export let maxHeight: 'max' | 'card' | 'limited' | string = 'max'
  export let focusable: boolean = false
  export let refContainer: HTMLElement | undefined = undefined
  export let shouldSaveDraft: boolean = false
  export let focusIndex: number | undefined = -1
  export let enableAttachments: boolean = true
  export let isScrollable = true
  export let kitOptions: Partial<EditorKitOptions> = {}
  export let fullWidth = false

  export let useDirectAttachDelete = false
  export let boundary: HTMLElement | undefined = undefined

  let draftKey = objectId != null ? `${objectId as string}_attachments` : undefined
  $: draftKey = objectId ? `${objectId}_attachments` : undefined

  const dispatch = createEventDispatcher()

  export function focus (): void {
    refInput.focus()
  }
  export function isFocused (): boolean {
    return refInput.isFocused()
  }
  export function isEditable (): boolean {
    return refInput.isEditable()
  }
  export function setEditable (editable: boolean): void {
    refInput.setEditable(editable)
  }
  export function setContent (data: string): void {
    refInput.setContent(data)
  }
  export function handleAttach (): void {
    inputFile.click()
  }

  export function submit (): void {
    refInput.submit()
  }
  let refInput: StyledTextBox
  let extraActions: RefAction[] = []

  let inputFile: HTMLInputElement
  let saved = false

  const client = getClient()
  const query = createQuery()
  let attachments: Map<Ref<Attachment>, Attachment> = new Map<Ref<Attachment>, Attachment>()
  let originalAttachments: Set<Ref<Attachment>> = new Set<Ref<Attachment>>()
  const newAttachments: Set<Ref<Attachment>> = new Set<Ref<Attachment>>()
  const removedAttachments: Set<Attachment> = new Set<Attachment>()

  $: void (draftKey && updateAttachments(objectId, $draftsStore[draftKey]))

  async function updateAttachments (
    objectId: Ref<Doc> | undefined,
    draftAttachments: Record<Ref<Attachment>, Attachment> | undefined
  ) {
    if (draftAttachments && shouldSaveDraft) {
      query.unsubscribe()
      attachments.clear()
      newAttachments.clear()
      Object.entries(draftAttachments).map((file) => {
        return attachments.set(file[0] as Ref<Attachment>, file[1])
      })
      Object.entries(draftAttachments).map((file) => {
        return newAttachments.add(file[0] as Ref<Attachment>)
      })
      originalAttachments.clear()
      removedAttachments.clear()
      attachments = attachments
    } else if (objectId) {
      query.query(
        attachment.class.Attachment,
        {
          attachedTo: objectId
        },
        (res) => {
          originalAttachments = new Set(res.map((p) => p._id))
          attachments = toIdMap(res)
          dispatch('attach', { action: 'saved', value: attachments.size })
        }
      )
    }
  }

  async function saveDraft () {
    if (draftKey && shouldSaveDraft) {
      const draftAttachments = Object.fromEntries(attachments)
      DraftController.save(draftKey, draftAttachments)
    }
  }

  async function attachFile (file: File): Promise<{ file: Ref<Blob>, type: string } | undefined> {
    try {
      const { uuid, metadata } = await uploadFile(file)
      await createAttachment(uuid, file.name, file, metadata)
      return { file: uuid, type: file.type }
    } catch (err: any) {
      await setPlatformStatus(unknownError(err))
    }
  }

  async function createAttachment (
    uuid: Ref<Blob>,
    name: string,
    file: FileOrBlob,
    metadata: BlobMetadata | undefined
  ): Promise<void> {
    if (space == null || objectId == null || _class == null) return
    try {
      addStored([draftAttachment({ space, objectId, _class }, name, file, uuid, metadata)])
    } catch (err: any) {
      void setPlatformStatus(unknownError(err))
    }
  }

  function addStored (docs: Attachment[]): void {
    for (const doc of docs) {
      attachments.set(doc._id, doc)
      newAttachments.add(doc._id)
    }
    attachments = attachments
    saved = false
    void saveDraft()
    dispatch('attach', { action: 'saved', value: attachments.size })
    for (const doc of docs) {
      dispatch('attached', doc._id)
      if (useDirectAttachDelete) void saveNewAttachment(doc._id)
    }
  }

  // A form that shows the files itself gets the queue with every change.
  let uploads = new UploadQueue(() => {
    uploads = uploads
    dispatch('uploads', uploads)
  }, addStored)

  let dragging = false

  // `enableAttachments` only hides the grid: a form drawing the files itself still takes them on drop.
  $: canDrop = space != null && objectId != null && _class != null

  function addFiles (files: Iterable<File>): void {
    if (space == null || objectId == null || _class == null) return
    for (const file of files) uploads.add(draftAttachment({ space, objectId, _class }, file.name, file), file)
    saved = false
  }

  async function saveAttachment (doc: Attachment, objectId: Ref<Doc> | undefined, op?: TxOperations): Promise<void> {
    if (space == null || objectId == null || _class == null) return
    newAttachments.delete(doc._id)
    await (op ?? client).addCollection(
      attachment.class.Attachment,
      space,
      objectId,
      _class,
      'attachments',
      doc,
      doc._id
    )
  }

  function fileSelected (): void {
    addFiles(pickedFiles(inputFile))
  }

  export function fileDrop (e: DragEvent): void {
    addFiles(droppedFiles(e))
  }

  async function removeAttachment (attachment: Attachment): Promise<void> {
    if (uploads.has(attachment._id)) {
      uploads.remove(attachment._id)
      return
    }
    uploads.release(attachment._id)
    if (useDirectAttachDelete) {
      progressItems.push(attachment._id)
      progressItems = progressItems
      await deleteAttachment(attachment)
    }
    removedAttachments.add(attachment)
    attachments.delete(attachment._id)
    attachments = attachments
    refInput.removeAttachment(attachment.file)
    void saveDraft()
    dispatch('detached', attachment._id)

    progressItems = progressItems.filter((it) => it !== attachment._id)
  }

  async function deleteAttachment (attachment: Attachment): Promise<void> {
    removedAttachments.delete(attachment)
    if (originalAttachments.has(attachment._id)) {
      await client.removeCollection(
        attachment._class,
        attachment.space,
        attachment._id,
        attachment.attachedTo,
        attachment.attachedToClass,
        'attachments'
      )
      dispatch('detached', attachment._id)
    } else {
      await deleteFile(attachment.file)
    }
  }

  onDestroy(() => {
    const stored = uploads.flush()
    if (stored.length > 0) addStored(stored)
    uploads.releaseAll()
    if (!saved && !shouldSaveDraft) {
      newAttachments.forEach((p) => {
        const attachment = attachments.get(p)
        if (attachment !== undefined) {
          void deleteAttachment(attachment)
        }
      })
    }
  })

  export function removeDraft (removeFiles: boolean) {
    if (draftKey) {
      DraftController.remove(draftKey)
    }
    if (removeFiles) {
      uploads.clear()
      newAttachments.forEach((p) => {
        const attachment = attachments.get(p)
        if (attachment !== undefined) {
          void deleteFile(attachment.file)
        }
      })
    }
  }

  export async function saveNewAttachment (_id: Ref<Attachment>): Promise<void> {
    const attachment = attachments.get(_id)
    if (attachment !== undefined) {
      await saveAttachment(attachment, objectId)
    }
  }

  export async function removeAttachmentById (_id: Ref<Attachment>): Promise<void> {
    if (uploads.has(_id)) {
      uploads.remove(_id)
      return
    }
    const attachment = attachments.get(_id)
    if (attachment !== undefined) {
      await removeAttachment(attachment)
    }
  }

  export async function createAttachments (_id: Ref<Doc> | undefined = objectId, op?: TxOperations): Promise<void> {
    if (saved) {
      return
    }
    saved = true
    await uploads.settled()
    const stored = uploads.flush()
    if (stored.length > 0) addStored(stored)
    // Adding the stored files marked the draft unsaved again.
    saved = true
    const promises: Promise<any>[] = []
    newAttachments.forEach((p) => {
      const attachment = attachments.get(p)
      if (attachment !== undefined) {
        promises.push(saveAttachment(attachment, _id, op))
      }
    })
    removedAttachments.forEach((p) => {
      promises.push(deleteAttachment(p))
    })
    await Promise.all(promises)
    removeDraft(false)
    newAttachments.clear()
    removedAttachments.clear()
  }

  function isAllowedPaste (evt: ClipboardEvent) {
    let t: HTMLElement | null = evt.target as HTMLElement

    if (!refContainer) {
      return true
    }

    while (t != null) {
      t = t.parentElement
      if (t === refContainer) {
        return true
      }
    }

    return false
  }

  export function pasteAction (evt: ClipboardEvent): void {
    if (!isAllowedPaste(evt)) {
      return
    }

    const items = evt.clipboardData?.items ?? []
    const files: File[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const blob = item.getAsFile()
        if (blob !== null) {
          files.push(blob)
        }
      }
    }

    addFiles(files)
  }

  export function getAttachments (): Attachment[] {
    return Array.from(attachments.values())
  }

  $: dispatch('attachments', {
    size: attachments.size,
    values: attachments.size === 0 ? true : attachments
  })

  $: if (enableAttachments) {
    extraActions = [
      {
        label: textEditor.string.Attach,
        icon: AttachIcon,
        action: handleAttach,
        order: 1001
      }
    ]
  } else {
    extraActions = []
  }

  let progressItems: Ref<Doc>[] = []
</script>

<input
  bind:this={inputFile}
  multiple
  type="file"
  name="file"
  id="file"
  style="display: none"
  disabled={inputFile == null}
  on:change={fileSelected}
/>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="flex-col clear-mins drop"
  class:w-full={fullWidth}
  class:dragging
  on:paste={(ev) => {
    pasteAction(ev)
  }}
  use:dropFiles={{ enabled: canDrop, onFiles: addFiles, onDragging: (on) => (dragging = on) }}
>
  <StyledTextBox
    {focusIndex}
    bind:this={refInput}
    bind:content
    {placeholder}
    {alwaysEdit}
    {showButtons}
    {buttonSize}
    {maxHeight}
    {focusable}
    {kind}
    {kitOptions}
    {isScrollable}
    {boundary}
    {extraActions}
    on:changeSize
    on:changeContent
    on:blur
    on:focus
    {attachFile}
  >
    <slot name="actions" slot="actions" />
  </StyledTextBox>
  {#if (attachments.size > 0 || uploads.size > 0) && enableAttachments}
    <AttachmentsGrid
      attachments={Array.from(attachments.values())}
      {uploads}
      drafts={newAttachments}
      on:remove={async (evt) => {
        if (evt.detail !== undefined) {
          await removeAttachment(evt.detail)
        }
      }}
    />
  {/if}
</div>

<style lang="scss">
  .drop {
    border-radius: var(--medium-BorderRadius);
    transition: background-color 0.15s ease;

    &.dragging {
      background-color: var(--global-ui-hover-BackgroundColor);
    }
  }
</style>
