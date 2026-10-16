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
  import { LINK_PREVIEW_TYPE, type Attachment } from '@hcengineering/attachment'
  import type {
    AttachedData,
    Blob as PlatformBlob,
    BlobMetadata,
    Class,
    Doc,
    IdMap,
    Markup,
    Ref,
    Space
  } from '@hcengineering/core'
  import { RateLimiter, toIdMap } from '@hcengineering/core'
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { getResource, setPlatformStatus, unknownError } from '@hcengineering/platform'
  import type { LinkPreviewAttachmentMetadata } from '@hcengineering/presentation'
  import {
    DraftController,
    canDisplayLinkPreview,
    createQuery,
    deleteFile,
    draftsStore,
    fetchLinkPreviewDetails,
    getClient,
    isLinkPreviewEnabled,
    uploadFile,
    generateFileId
  } from '@hcengineering/presentation'
  import { EmptyMarkup, extractLinks, isEmptyMarkup, markupToJSON } from '@hcengineering/text'
  import textEditor, { type RefAction } from '@hcengineering/text-editor'
  import { ReferenceInput } from '@hcengineering/text-editor-resources'
  import ui, { type AnySvelteComponent } from '@hcengineering/ui'
  import {
    type FileUploadCallbackParams,
    type UploadHandlerDefinition,
    getUploadHandlers
  } from '@hcengineering/uploader'
  import { createEventDispatcher, onDestroy, tick } from 'svelte'

  import attachment from '../plugin'
  import { compareAsInMessage } from '../utils'
  import AttachmentTile from './file/AttachmentTile.svelte'
  import { dropFiles, pickedFiles } from './file/drop'
  import { notifyInterrupted } from './file/interrupted'
  import { UploadQueue, draftAttachment, keepStored, uploadTiles } from './file/uploads'

  export let objectId: Ref<Doc>
  export let space: Ref<Space>
  export let _class: Ref<Class<Doc>>
  export let docId: Ref<Doc> | undefined = undefined
  export let docClass: Ref<Class<Doc>> | undefined = undefined
  export let content: Markup = EmptyMarkup
  export let iconSend: Asset | AnySvelteComponent | undefined = undefined
  export let labelSend: IntlString | undefined = undefined
  export let showSend = true
  export let showActions = true
  export let shouldSaveDraft: boolean = false
  export let attachments: IdMap<Attachment> = new Map()
  export let loading = false
  export let focusIndex: number = -1
  export let autofocus = false
  export let isContentChanged = false
  export function submit (): void {
    refInput.submit()
  }
  export let placeholder: IntlString | undefined = undefined
  export let disableSubmit = false
  export let clearOnSubmit = true
  export let hasHeader: boolean = false
  export let extraActions: RefAction[] = []
  export let boundary: HTMLElement | undefined = undefined
  export let skipAttachmentsPreload = false
  export let disableAttachments = false
  export let onKeyDown: ((event: KeyboardEvent) => boolean) | undefined = undefined
  export let recording = false
  /** Called from this input's own destroy with the files it kept: the owner may be destroyed already. */
  export let onLeave: ((attachments: number) => void) | undefined = undefined
  export let beforeSend: (() => Promise<void>) | undefined = undefined

  let refInput: ReferenceInput

  let inputFile: HTMLInputElement
  let saved = false
  const dispatch = createEventDispatcher()

  const client = getClient()
  const query = createQuery()

  // Not the old `_attachments` key: those drafts hold docs created before the send.
  $: draftKey = `${objectId}_files`
  $: draftController = new DraftController<Record<Ref<Attachment>, Attachment>>(draftKey)

  let draftAttachments: Record<Ref<Attachment>, Attachment> | undefined = undefined
  let originalAttachments: Set<Ref<Attachment>> = new Set<Ref<Attachment>>()
  // Docs are created on send: until then a draft holds only stored files.
  const newAttachments: Set<Ref<Attachment>> = new Set<Ref<Attachment>>()
  // Removed from an edited message: deleted on send, kept on cancel.
  const removedAttachments = new Map<Ref<Attachment>, Attachment>()
  const maxLinkPreviewCount = 3
  let urlSet = new Set<string>()
  let loadingPreviews = 0

  let uploads = new UploadQueue(
    () => {
      uploads = uploads
    },
    (docs) => {
      for (const doc of docs) {
        attachments.set(doc._id, doc)
        newAttachments.add(doc._id)
      }
      attachments = attachments
      saveDraft()
      notify()
    }
  )
  let dragging = false

  // Before every reader of `attachments`: an earlier one misses the draft restored in the call.
  let loadedFor: Ref<Doc> | undefined
  $: void (objectId && updateAttachments(objectId))

  $: previews = Array.from(attachments.values()).filter((it) => it.type === LINK_PREVIEW_TYPE).length + loadingPreviews
  $: tiles = uploadTiles(attachments.values(), uploads, (doc) => newAttachments.has(doc._id))

  // Sends so far: a link preview arriving after its send goes to that message, not the next.
  let sends = 0

  let refContainer: HTMLElement

  const existingAttachmentsQuery = createQuery()
  let existingAttachments: Ref<Attachment>[] = []

  $: if (Array.from(attachments.keys()).length > 0) {
    existingAttachmentsQuery.query(
      attachment.class.Attachment,
      {
        space,
        attachedTo: objectId,
        attachedToClass: _class,
        _id: { $in: Array.from(attachments.keys()) }
      },
      (res) => {
        existingAttachments = res.map((p) => p._id)
      }
    )
  } else {
    existingAttachments = []
    existingAttachmentsQuery.unsubscribe()
  }

  function isValidUrl (s: string): boolean {
    let url: URL
    try {
      url = new URL(s)
    } catch {
      return false
    }
    return url.protocol.startsWith('http')
  }

  // The form `extractLinks` gives, so a link in the text and the same one in the editor match.
  function getUrlKey (s: string): string {
    try {
      return new URL(s).toString()
    } catch {
      return s
    }
  }

  // Links already in the text never get a preview: it exists or its author removed it.
  function knownLinks (markup: Markup): Set<string> {
    if (isEmptyMarkup(markup)) return new Set()
    return new Set(extractLinks(markupToJSON(markup)).map((it) => getUrlKey(it.url)))
  }

  async function updateAttachments (objectId: Ref<Doc>): Promise<void> {
    const moved = loadedFor !== objectId
    // Another message: files still going up belong to the one they were added to.
    if (moved) {
      uploads.clear()
      uploads.releaseAll()
      urlSet = knownLinks(content)
    }
    loadedFor = objectId
    draftAttachments = $draftsStore[draftKey]
    // Written before the `_files` key: its docs are already in the DB and load by the query below.
    if (shouldSaveDraft && $draftsStore[`${objectId}_attachments`] != null) {
      DraftController.remove(`${objectId}_attachments`)
    }
    if (draftAttachments && shouldSaveDraft) {
      attachments = new Map()
      newAttachments.clear()
      originalAttachments.clear()
      for (const [_id, doc] of Object.entries(draftAttachments)) {
        attachments.set(_id as Ref<Attachment>, doc)
        newAttachments.add(_id as Ref<Attachment>)
      }
      removedAttachments.clear()
      query.unsubscribe()
    } else if (!skipAttachmentsPreload) {
      if (moved) forgetPrevious()
      query.query(
        attachment.class.Attachment,
        {
          attachedTo: objectId
        },
        (res) => {
          originalAttachments = new Set(res.map((p) => p._id))
          // Added files are not docs yet, removed ones stay hidden until saved; order matches the message.
          const next = toIdMap(res.filter((p) => !removedAttachments.has(p._id)).sort(compareAsInMessage))
          for (const _id of newAttachments) {
            const doc = attachments.get(_id)
            if (doc != null) next.set(_id, doc)
          }
          attachments = next
        }
      )
    } else {
      forgetPrevious()
      query.unsubscribe()
    }
  }

  // Unsent files of the previous object belong to its draft; without drafts nothing will send them.
  function forgetPrevious (): void {
    if (!shouldSaveDraft) {
      for (const _id of newAttachments) {
        const doc = attachments.get(_id)
        if (doc != null) void deleteFile(doc.file)
      }
    }
    attachments = new Map()
    newAttachments.clear()
    originalAttachments.clear()
    removedAttachments.clear()
  }

  function saveDraft (): void {
    if (shouldSaveDraft) {
      draftAttachments = Object.fromEntries(attachments)
      draftController.save(draftAttachments)
    }
  }

  function notify (): void {
    dispatch('update', { message: content, attachments: attachments.size })
  }

  function addStored (file: Ref<PlatformBlob>, name: string, blob: File | Blob, metadata?: BlobMetadata): void {
    addAttachmentDoc(draftAttachment({ space, objectId, _class }, name, blob, file, metadata))
  }

  // Files given while a send runs: the message has taken its list already, they start the next one.
  let sending = false
  let afterSend: File[] = []

  function addFiles (files: Iterable<File>): void {
    if (disableAttachments) return
    if (sending) {
      afterSend.push(...files)
      return
    }
    for (const file of files) uploads.add(draftAttachment({ space, objectId, _class }, file.name, file), file)
    saved = false
  }

  const systemKeys = new Set([
    '_id',
    '_class',
    'space',
    'attachedTo',
    'attachedToClass',
    'collection',
    'modifiedOn',
    'modifiedBy',
    'createdOn',
    'createdBy'
  ])

  async function saveAttachment (doc: Attachment): Promise<void> {
    if (existingAttachments.includes(doc._id)) return
    const data = Object.fromEntries(Object.entries(doc).filter(([key]) => !systemKeys.has(key)))
    // A voice note keeps its class: its transcription starts when the doc is created.
    await client.addCollection(
      doc._class,
      space,
      objectId,
      _class,
      'attachments',
      data as AttachedData<Attachment>,
      doc._id
    )
    newAttachments.delete(doc._id)
  }

  function fileSelected (): void {
    addFiles(pickedFiles(inputFile))
  }

  function removeTile (doc: Attachment): void {
    if (uploads.has(doc._id)) {
      uploads.remove(doc._id)
      return
    }
    uploads.release(doc._id)
    attachments.delete(doc._id)
    attachments = attachments
    if (originalAttachments.has(doc._id)) {
      removedAttachments.set(doc._id, doc)
    } else {
      newAttachments.delete(doc._id)
      void deleteFile(doc.file)
    }
    saveDraft()
    notify()
  }

  async function deleteAttachment (doc: Attachment): Promise<void> {
    await client.removeCollection(doc._class, doc.space, doc._id, doc.attachedTo, doc.attachedToClass, 'attachments')
    removedAttachments.delete(doc._id)
  }

  onDestroy(() => {
    const lost = keepStored(uploads, attachments, newAttachments)
    // Only where the files were to stay: leaving without a draft is discarding them on purpose.
    if (shouldSaveDraft) void notifyInterrupted(lost)
    if (shouldSaveDraft) {
      saveDraft()
    } else if (!saved) {
      for (const _id of newAttachments) {
        const doc = attachments.get(_id)
        if (doc != null) void deleteFile(doc.file)
      }
    }
    onLeave?.(attachments.size)
    uploads.releaseAll()
  })

  export function removeDraft (removeFiles: boolean): void {
    draftController.remove()
    if (removeFiles) {
      uploads.clear()
      newAttachments.forEach((p) => {
        const doc = attachments.get(p)
        if (doc != null) {
          void deleteFile(doc.file)
        }
      })
    }
  }

  export function isEmptyDraft (): boolean {
    return attachments.size === 0 && uploads.size === 0 && isEmptyMarkup(content)
  }

  export async function createAttachments (): Promise<void> {
    if (saved) {
      return
    }
    saved = true
    const limiter = new RateLimiter(10)
    // The limiter only logs a failure: without this the message would go out without the file.
    let failure: Error | undefined
    const fail = (err: unknown): void => {
      failure ??= err instanceof Error ? err : new Error(String(err))
    }
    newAttachments.forEach((p) => {
      const doc = attachments.get(p)
      if (doc != null) {
        void limiter.add(() => saveAttachment(doc), undefined, fail)
      }
    })
    removedAttachments.forEach((p) => {
      void limiter.add(() => deleteAttachment(p), undefined, fail)
    })
    await limiter.waitProcessing()
    if (failure !== undefined) {
      // Done ones have left the sets, so a retry repeats only what failed.
      saved = false
      throw failure
    }
    newAttachments.clear()
    urlSet.clear()
    removedAttachments.clear()
    saveDraft()
  }

  // Drop the draft attachment set after the message is dispatched (id known to the message), so the
  // next message starts empty without racing the objectId-change reactive. Docs stay in the DB.
  function clearAttachmentsAfterSend (): void {
    uploads.releaseAll()
    attachments = new Map()
    newAttachments.clear()
    originalAttachments.clear()
    removedAttachments.clear()
    urlSet.clear()
    saveDraft()
  }

  async function onMessage (event: CustomEvent): Promise<void> {
    // canSubmit (!loading) disables Send only after the next render; while recording an emptied
    // editor still counts as having an attachment, so repeats sent empty messages.
    if (sending) return
    sends++
    loading = true
    sending = true
    let ready = false
    try {
      await beforeSend?.()
      await createAttachments()
      ready = true
    } catch (err: any) {
      // Not sent: the draft stays as it was, and so do the previews coming for it.
      sends--
      await setPlatformStatus(unknownError(err))
    } finally {
      sending = false
      loading = false
    }
    if (ready) {
      dispatch('message', { message: event.detail, attachments: attachments.size })
      clearAttachmentsAfterSend()
    }
    if (afterSend.length > 0) {
      const files = afterSend
      afterSend = []
      // Once the input has moved to the next message.
      if (ready) await tick()
      addFiles(files)
    }
  }

  function updateLinkPreview (): void {
    const hrefs = refContainer.getElementsByTagName('a')
    const newUrls: string[] = []
    for (let i = 0; i < hrefs.length; i++) {
      if (hrefs[i].target !== '_blank' || !isValidUrl(hrefs[i].href) || hrefs[i].rel === '') {
        continue
      }
      const key = getUrlKey(hrefs[i].href)
      if (urlSet.has(key)) {
        continue
      }
      if (previews + newUrls.length >= maxLinkPreviewCount) break
      urlSet.add(key)
      newUrls.push(hrefs[i].href)
    }
    if (newUrls.length > 0) {
      void loadLinks(newUrls)
    }
  }

  function onUpdate (event: CustomEvent): void {
    if (isLinkPreviewEnabled() && !loading && previews < maxLinkPreviewCount) {
      updateLinkPreview()
    }
    dispatch('update', { message: event.detail, attachments: attachments.size })
  }

  async function loadLinks (urls: string[]): Promise<void> {
    const target = { objectId, space, _class, send: sends }
    loadingPreviews += urls.length
    for (const url of urls) {
      try {
        const meta = await fetchLinkPreviewDetails(url)
        if (canDisplayLinkPreview(meta)) {
          const uuid = generateFileId()
          const blob = new Blob([JSON.stringify(meta)])
          const file = new File([blob], uuid, { type: LINK_PREVIEW_TYPE })
          const metadata: LinkPreviewAttachmentMetadata = {
            title: meta.title,
            image: meta.image,
            description: meta.description,
            imageWidth: meta.imageWidth,
            imageHeight: meta.imageHeight,
            // Kept here too: the card still shows the address when the file fails to load.
            url: meta.url ?? url
          }
          const { uuid: stored } = await uploadFile(file)
          // The same draft only: the input may have moved to another chat meanwhile.
          if (sends === target.send && objectId === target.objectId) {
            addStored(stored, file.name, file, metadata)
          } else if (sends === target.send) {
            // Moved to another chat unsent: the message it was typed for will never exist.
            void deleteFile(stored)
          } else {
            // Already sent: straight onto that message, past the draft of the next one.
            try {
              await client.addCollection(
                attachment.class.Attachment,
                target.space,
                target.objectId,
                target._class,
                'attachments',
                {
                  name: file.name,
                  file: stored,
                  type: file.type,
                  size: file.size,
                  lastModified: file.lastModified,
                  metadata
                }
              )
            } catch (err: any) {
              void deleteFile(stored)
              throw err
            }
          }
        }
      } catch (err: any) {
        void setPlatformStatus(unknownError(err))
      } finally {
        loadingPreviews--
      }
    }
  }

  function pasteAction (_: any, evt: ClipboardEvent): boolean {
    let target: HTMLElement | null = evt.target as HTMLElement
    let allowed = false

    while (target != null) {
      target = target.parentElement
      if (target === refContainer) {
        allowed = true
      }
    }
    if (!allowed || disableAttachments) {
      return false
    }
    const files = Array.from(evt.clipboardData?.files ?? [])
    if (files.length === 0) return false
    addFiles(files)
    return true
  }

  async function onFileUploaded ({ uuid, name, file, metadata }: FileUploadCallbackParams): Promise<void> {
    try {
      await updateAttachments(objectId)
      addStored(uuid, name, file, metadata)
    } catch (err: any) {
      void setPlatformStatus(unknownError(err))
    }
  }

  async function uploadWith (handler: UploadHandlerDefinition): Promise<void> {
    const upload = await getResource(handler.handler)
    const target = { objectId: docId ?? objectId, objectClass: docClass ?? _class }
    // save draft before recording
    dispatch('update', { message: content, attachments: attachments.size })
    await upload({ onFileUploaded, target })
  }

  let uploadActionIndex = 1000
  const uploadHandlers = getUploadHandlers(client, { category: 'media' })
  const uploadActions: RefAction[] = uploadHandlers.map((handler) => ({
    order: handler.order ?? uploadActionIndex++,
    label: handler.label,
    icon: handler.icon,
    action: () => {
      void uploadWith(handler)
    }
  }))

  export function focus (): void {
    if (refInput == null) return
    refInput.focus()
  }

  export function addAttachmentDoc (doc: Attachment): void {
    attachments.set(doc._id, doc)
    newAttachments.add(doc._id)
    attachments = attachments
    saved = false
    saveDraft()
    notify()
  }
</script>

<div class="flex-col no-print" bind:this={refContainer}>
  <input
    bind:this={inputFile}
    disabled={inputFile == null}
    multiple
    type="file"
    name="file"
    id="file"
    style="display: none"
    on:change={fileSelected}
  />
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="flex-col drop"
    class:dragging
    use:dropFiles={{ enabled: !disableAttachments, onFiles: addFiles, onDragging: (on) => (dragging = on) }}
  >
    <ReferenceInput
      {focusIndex}
      bind:this={refInput}
      bind:content
      {iconSend}
      labelSend={uploads.size > 0
        ? uploads.failed
          ? attachment.string.FilesNotUploaded
          : attachment.string.FilesUploading
        : labelSend}
      {showSend}
      {showActions}
      disableSubmit={disableSubmit || uploads.size > 0}
      {clearOnSubmit}
      autofocus={autofocus ? 'end' : false}
      {loading}
      {boundary}
      {docClass}
      {isContentChanged}
      extraActions={[
        ...extraActions,
        ...(disableAttachments
          ? []
          : [
              {
                label: textEditor.string.Attach,
                icon: ui.icon.Paperclip,
                action: () => {
                  dispatch('focus')
                  inputFile.click()
                },
                order: 1001
              }
            ]),
        ...(disableAttachments ? [] : uploadActions)
      ]}
      showHeader={tiles.length > 0 || recording || hasHeader}
      haveAttachment={attachments.size > 0 || recording}
      on:focus
      on:blur
      on:message={onMessage}
      on:update={onUpdate}
      onPaste={pasteAction}
      onKeyDown={(_, ev) => onKeyDown?.(ev) ?? false}
      {placeholder}
      kitOptions={{
        file: false,
        image: false
      }}
    >
      <div slot="header">
        {#if recording}
          <div class="recorder"><slot name="recorder" /></div>
        {/if}
        {#if (tiles.length > 0 && !disableAttachments) || hasHeader}
          <div class="list">
            {#each disableAttachments ? [] : tiles as tile (tile.doc._id)}
              <AttachmentTile
                value={tile.doc}
                upload={tile.upload}
                draft={tile.draft}
                local={uploads.picture(tile.doc._id)}
                removable
                on:remove={() => {
                  removeTile(tile.doc)
                }}
                on:retry={() => {
                  uploads.retry(tile.doc._id)
                }}
              />
            {/each}
            <slot name="header" />
          </div>
        {/if}
      </div>
    </ReferenceInput>
  </div>
</div>

<style lang="scss">
  .drop {
    border-radius: var(--medium-BorderRadius);
    transition: background-color 0.15s ease;

    &.dragging {
      background-color: var(--global-ui-hover-BackgroundColor);
    }
  }

  .recorder {
    padding: 0.5rem 0.5rem 0;
  }

  // Room above and below for the tiles' shadow, which the scrolling strip would cut.
  .list {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
  }
</style>
