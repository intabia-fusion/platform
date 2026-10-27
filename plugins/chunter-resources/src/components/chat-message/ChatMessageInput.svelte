<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { ActivityMessage, Applet, AppletDraft, CreateAppletClient } from '@hcengineering/activity'
  import activity from '@hcengineering/activity'
  import { Analytics } from '@hcengineering/analytics'
  import { AttachmentRefInput } from '@hcengineering/attachment-resources'
  import type { ChatMessage, ThreadMessage } from '@hcengineering/chunter'
  import chunter, { ChunterEvents } from '@hcengineering/chunter'
  import type { Class, Doc, Ref, Markup, WithLookup, DocumentUpdate, Space } from '@hcengineering/core'
  import core, { generateId, getCurrentAccount, type CommitResult } from '@hcengineering/core'
  import { createQuery, DraftController, draftsStore, getClient } from '@hcengineering/presentation'
  import { EmptyMarkup, isEmptyMarkup } from '@hcengineering/text'
  import type { RefAction } from '@hcengineering/text-editor'
  import type { Attachment } from '@hcengineering/attachment'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { getObjectId } from '@hcengineering/view-resources'
  import { getResource } from '@hcengineering/platform'
  import ui, { showPopup, ThrottledCaller } from '@hcengineering/ui'
  import {
    getSpace,
    editingMessageStore,
    AppletPreview,
    getAppletDraftExpiry,
    MAX_TIMER_DELAY
  } from '@hcengineering/activity-resources'
  import { setTyping, clearTyping } from '@hcengineering/presence-resources'

  import ReplyToMessagePresenter from '../ReplyToMessagePresenter.svelte'
  import { getChannelSpace } from '../../utils'
  import { getForwardData } from '../../forwardData'
  import { isMessageContentChanged, passesArrowKeys } from '../../chatInput'
  import { replyingToMessageStore } from '../../stores'
  import ChannelTypingInfo from '../ChannelTypingInfo.svelte'
  import AIRequestProgress from '../AIRequestProgress.svelte'
  import VoiceRecordingHud from './VoiceRecordingHud.svelte'

  export let object: Doc
  export let chatMessage: ChatMessage | undefined = undefined
  export let shouldSaveDraft: boolean = true
  export let focusIndex: number = -1
  export let boundary: HTMLElement | undefined = undefined
  export let loading = false
  export let collection: string = 'comments'
  export let autofocus = false
  export let withTypingInfo = false
  export let onKeyDown: ((e: KeyboardEvent) => void) | undefined = undefined

  // Not `applets`: in edit mode the draft is the message itself, whose `applets` is a counter.
  type MessageDraft = Pick<ChatMessage, '_id' | 'message' | 'attachments' | 'forwardedMessage'> & {
    appletDrafts?: AppletDraft[]
  }

  const dispatch = createEventDispatcher()

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const _class: Ref<Class<ChatMessage>> = hierarchy.isDerived(object._class, activity.class.ActivityMessage)
    ? chunter.class.ThreadMessage
    : chunter.class.ChatMessage
  const createdMessageQuery = createQuery()
  const replyMessageQuery = createQuery()

  const draftKey = `${object._id}_${_class}`
  const draftController = new DraftController<MessageDraft>(draftKey)
  const currentDraft = shouldSaveDraft ? $draftsStore[draftKey] : undefined

  const emptyMessage: Pick<MessageDraft, 'message' | 'attachments' | 'forwardedMessage' | 'appletDrafts'> = {
    message: EmptyMarkup,
    attachments: 0,
    forwardedMessage: undefined,
    appletDrafts: undefined
  }

  let inputRef: AttachmentRefInput
  let currentMessage: MessageDraft = chatMessage ?? currentDraft ?? getDefault()
  let _id = currentMessage._id
  let inputContent = currentMessage.message

  let recording = false
  let recorder: VoiceRecordingHud | undefined
  const voiceActions: RefAction[] = [
    {
      label: chunter.string.RecordVoice,
      icon: ui.icon.Mic,
      order: 2000,
      action: () => {
        recording = true
      }
    }
  ]

  // The recording joins the draft like a file; its doc is created on send.
  function onAudioAttachment (e: CustomEvent<Attachment>): void {
    inputRef?.addAttachmentDoc(e.detail)
  }

  let forwardedMessage: WithLookup<ChatMessage> | undefined = undefined
  let draftApplets: AppletDraft[] = chatMessage == null ? (currentMessage.appletDrafts ?? []) : []

  // No field when empty: a draft without applets still counts as empty.
  $: if (chatMessage == null) currentMessage.appletDrafts = draftApplets.length > 0 ? draftApplets : undefined

  // A draft can expire while waiting: its preview says why, and the message is not sent.
  let now = Date.now()
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  $: draftExpiry = Math.min(Infinity, ...draftApplets.map((it) => getAppletDraftExpiry(it) ?? Infinity))
  $: draftExpired = draftExpiry <= now
  $: {
    clearTimeout(expiryTimer)
    if (draftExpiry > now && draftExpiry !== Infinity) {
      expiryTimer = setTimeout(
        () => {
          now = Date.now()
        },
        Math.min(draftExpiry - Date.now() + 100, MAX_TIMER_DELAY)
      )
    }
  }
  onDestroy(() => {
    clearTimeout(expiryTimer)
  })

  function updateDraftApplet (id: string, params: Record<string, any>): void {
    draftApplets = draftApplets.map((item) => (item.id === id ? { ...item, params } : item))
  }

  function removeDraftApplet (id: string): void {
    draftApplets = draftApplets.filter((item) => item.id !== id)
  }

  $: forwardedMessageId = chatMessage ? chatMessage.forwardedMessage : currentMessage.forwardedMessage

  $: if (
    forwardedMessage == null &&
    forwardedMessageId != null &&
    forwardedMessageId === $replyingToMessageStore?._id
  ) {
    forwardedMessage = $replyingToMessageStore
  }

  $: if (forwardedMessageId !== undefined) {
    replyMessageQuery.query(chunter.class.ChatMessage, { _id: forwardedMessageId as Ref<ChatMessage> }, (res) => {
      if (chatMessage === undefined) {
        replyingToMessageStore.set(res[0])
      }

      forwardedMessage = res[0]
    })
  } else {
    replyMessageQuery.unsubscribe()
    forwardedMessage = undefined
  }

  $: if (currentDraft != null) {
    createdMessageQuery.query(_class, { _id, space: getSpace(object) }, (result: ChatMessage[]) => {
      if (result.length > 0 && _id !== chatMessage?._id) {
        // Ouch we have got comment with same id created already.
        clear()
      }
    })
  } else {
    createdMessageQuery.unsubscribe()
  }

  function clear (): void {
    currentMessage = getDefault()
    _id = currentMessage._id
    draftApplets = []
    inputRef.removeDraft(false)
  }

  function objectChange (draft: MessageDraft, empty: Partial<MessageDraft>): void {
    if (shouldSaveDraft) {
      draftController.save(draft, empty)
    }
  }

  $: objectChange(currentMessage, emptyMessage)

  function getDefault (): MessageDraft {
    return {
      _id: generateId(),
      ...emptyMessage
    }
  }

  const acc = getCurrentAccount()
  const throttle = new ThrottledCaller(500)

  $: space = hierarchy.isDerived(object._class, core.class.Space) ? (object._id as Ref<Space>) : object.space

  async function deleteTypingInfo (): Promise<void> {
    if (!withTypingInfo) return
    void clearTyping(acc.primarySocialId, object._id)
  }

  async function updateTypingInfo (): Promise<void> {
    if (!withTypingInfo) return

    throttle.call(() => {
      void setTyping(acc.primarySocialId, object._id, space)
    })
  }

  onDestroy(() => {
    void deleteTypingInfo()
  })

  // A file stored behind a slower one joins the draft only as the input goes: without the count it is dropped as empty.
  function onInputLeave (attachments: number): void {
    if (attachments !== currentMessage.attachments) objectChange({ ...currentMessage, attachments }, emptyMessage)
  }

  function onUpdate (event: CustomEvent<{ message: Markup, attachments: number }>): void {
    if (!isEmptyMarkup(event.detail.message)) {
      void updateTypingInfo()
    }
    if (!shouldSaveDraft) {
      return
    }
    const { message, attachments } = event.detail
    currentMessage.message = message
    currentMessage.attachments = attachments
  }

  async function handleCreate (event: CustomEvent, _id: Ref<ChatMessage>, applets: AppletDraft[]): Promise<void> {
    try {
      const res = await createMessage(event, _id, `chunter.create.${_class} ${object._class}`, applets)

      console.log(`create.${_class} measure`, res.serverTime, res.time)
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageCreated, { ok: res.result, objectId, objectClass: object._class })
    } catch (err: any) {
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageCreated, { ok: false, objectId, objectClass: object._class })
      Analytics.handleError(err)
    }
  }

  async function handleEdit (event: CustomEvent): Promise<void> {
    try {
      await editMessage(event)
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageEdited, { ok: true, objectId, objectClass: object._class })
    } catch (err: any) {
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageEdited, { ok: false, objectId, objectClass: object._class })
      Analytics.handleError(err)
    }
  }

  async function onMessage (event: CustomEvent): Promise<void> {
    const applets = [...draftApplets]
    // The edit input shares the draft key with the bottom one: saving an edit must keep that draft.
    if (chatMessage == null) draftController.remove()
    inputRef.removeDraft(false)

    if (chatMessage !== undefined) {
      loading = true
      await handleEdit(event)
    } else {
      void handleCreate(event, _id, applets)
      void deleteTypingInfo()
    }

    // Remove draft from Local Storage
    clear()
    if (chatMessage === undefined) {
      replyingToMessageStore.set(undefined)
    }
    dispatch('submit', false)
    loading = false
  }

  async function createMessage (
    event: CustomEvent,
    messageId: Ref<ChatMessage>,
    msg: string,
    applets: AppletDraft[]
  ): Promise<CommitResult> {
    const { message, attachments } = event.detail
    const operations = client.apply(undefined, msg)
    const messageSpace = _class === chunter.class.ThreadMessage ? (object as ActivityMessage).space : getSpace(object)

    if (_class === chunter.class.ThreadMessage) {
      const parentMessage = object as ActivityMessage

      await operations.addCollection<ActivityMessage, ThreadMessage>(
        chunter.class.ThreadMessage,
        messageSpace,
        parentMessage._id,
        parentMessage._class,
        'replies',
        {
          message,
          attachments,
          objectClass: parentMessage.attachedToClass,
          objectId: parentMessage.attachedTo,
          ...(forwardedMessage != null ? await getForwardData(forwardedMessage) : {})
        },
        messageId as Ref<ThreadMessage>
      )
    } else {
      await operations.addCollection<Doc, ChatMessage>(
        _class,
        messageSpace,
        object._id,
        object._class,
        collection,
        {
          message,
          attachments,
          ...(forwardedMessage != null ? await getForwardData(forwardedMessage) : {})
        },
        messageId
      )
    }

    for (const item of applets) {
      await createAppletInstance(
        item.appletId,
        item.params,
        messageId as Ref<ActivityMessage>,
        _class as Ref<Class<ActivityMessage>>,
        messageSpace,
        operations
      )
    }

    return await operations.commit()
  }

  async function editMessage (event: CustomEvent): Promise<void> {
    if (chatMessage === undefined) {
      return
    }
    const { message, attachments } = event.detail
    const update: DocumentUpdate<ChatMessage> = { message, attachments, editedOn: Date.now() }

    const op = client.apply('edit-message')
    if (currentMessage.forwardedMessage == null && chatMessage.forwardedMessage != null) {
      await op.update(chatMessage, {
        $unset: {
          forwardedMessage: true,
          forwardFromId: true,
          forwardFromClass: true,
          forwardContent: true
        }
      })
    }

    await op.diffUpdate(chatMessage, update)
    await op.commit()
  }
  export function submit (): void {
    inputRef.submit()
  }

  function handleKeyDown (event: KeyboardEvent): boolean {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (passesArrowKeys(chatMessage, inputRef.isEmptyDraft(), draftApplets)) {
        onKeyDown?.(event)
      }
    }

    if (event.key === 'Escape') {
      if ($editingMessageStore !== undefined) {
        event.stopPropagation()
        event.preventDefault()
        editingMessageStore.set(undefined)
        return false
      }

      if ($replyingToMessageStore !== undefined) {
        event.stopPropagation()
        event.preventDefault()
        replyingToMessageStore.set(undefined)
        currentMessage = { ...currentMessage, forwardedMessage: undefined }
        return false
      }
    }
    return false
  }

  function handleReplyMessageDelete (): void {
    if (chatMessage === undefined) {
      replyingToMessageStore.set(undefined)
    }

    currentMessage = { ...currentMessage, forwardedMessage: undefined }
  }

  let prevReplyTo: Ref<ActivityMessage>

  $: if (
    $replyingToMessageStore?.attachedTo === object._id &&
    currentMessage.forwardedMessage !== $replyingToMessageStore._id
  ) {
    currentMessage.forwardedMessage = $replyingToMessageStore._id
  }

  $: {
    const id = $replyingToMessageStore?._id
    if (id != null && id !== prevReplyTo && inputRef != null) {
      prevReplyTo = id
      inputRef.focus()
    }
  }
  const appletModels = client.getModel().findAllSync(activity.class.Applet, {})
  let appletActions: RefAction[] = []
  // Editing changes text and attachments only, a poll comes with a new message.
  $: appletActions =
    chatMessage != null
      ? []
      : appletModels.map((applet) => ({
          label: applet.label,
          icon: applet.actionIcon ?? applet.icon,
          action: () => {
            showAppletCreate(applet)
          },
          order: 99999
        }))

  // Outside the block above: a `draftApplets` read there would rebuild the input actions on every draft change.
  function showAppletCreate (applet: Applet): void {
    showPopup(applet.createComponent, { applet }, 'center', (result) => {
      if (result != null) {
        draftApplets = [...draftApplets, { id: generateId(), appletId: applet._id, params: result }]
      }
    })
  }

  async function createAppletInstance (
    appletId: Ref<Applet>,
    params: Record<string, any>,
    targetId: Ref<ActivityMessage>,
    targetClass: Ref<Class<ActivityMessage>>,
    targetSpace: Ref<Space>,
    op: CreateAppletClient
  ): Promise<void> {
    const applet = appletModels.find((it) => it._id === appletId)
    if (applet?.createFn != null) {
      const createFn = await getResource(applet.createFn)
      await createFn(op, targetId, targetClass, targetSpace, params)
    }
  }
</script>

{#if chatMessage === undefined}
  {#if forwardedMessage?.attachedTo === object._id}
    <ReplyToMessagePresenter replyTo={forwardedMessage} on:delete={handleReplyMessageDelete} />
  {/if}
{:else if forwardedMessage !== undefined && currentMessage.forwardedMessage === forwardedMessage._id}
  <ReplyToMessagePresenter replyTo={forwardedMessage} on:delete={handleReplyMessageDelete} />
{/if}

<AttachmentRefInput
  {focusIndex}
  bind:this={inputRef}
  bind:content={inputContent}
  docId={object._id}
  docClass={object._class}
  {_class}
  space={getChannelSpace(object._class, object._id, object.space)}
  skipAttachmentsPreload={(currentMessage.attachments ?? 0) === 0}
  bind:objectId={_id}
  {shouldSaveDraft}
  {boundary}
  {autofocus}
  extraActions={[...voiceActions, ...appletActions]}
  hasHeader={draftApplets.length > 0}
  disableSubmit={draftExpired}
  isContentChanged={isMessageContentChanged({
    edited: chatMessage,
    forwardedMessage: forwardedMessage?._id,
    text: inputContent,
    attachments: currentMessage.attachments ?? 0,
    drafts: draftApplets
  })}
  on:message={onMessage}
  on:update={onUpdate}
  onLeave={onInputLeave}
  on:focus
  on:blur
  bind:loading
  onKeyDown={handleKeyDown}
  {recording}
  beforeSend={recording ? async () => await recorder?.finish() : undefined}
>
  <svelte:fragment slot="recorder">
    {#if recording}
      <VoiceRecordingHud
        bind:this={recorder}
        objectId={_id}
        objectClass={_class}
        space={getChannelSpace(object._class, object._id, object.space)}
        on:audio={onAudioAttachment}
        on:close={() => {
          recording = false
          inputRef?.focus()
        }}
      />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="header">
    {#each draftApplets as item (item.id)}
      {@const model = appletModels.find((it) => it._id === item.appletId)}
      {#if model != null}
        <div class="flex">
          <AppletPreview
            applet={item}
            {model}
            on:change={(e) => {
              updateDraftApplet(item.id, e.detail)
            }}
            on:delete={() => {
              removeDraftApplet(item.id)
            }}
          />
        </div>
      {/if}
    {/each}
  </svelte:fragment>
</AttachmentRefInput>

{#if withTypingInfo}
  <div class="typing-row">
    <ChannelTypingInfo {object} />
    <AIRequestProgress {object} />
  </div>
{/if}

<style lang="scss">
  .typing-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
