<!--
// Copyright © 2026 Intabia Fusion.
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
  import { createEventDispatcher } from 'svelte'
  import type { ChatMessage } from '@hcengineering/chunter'
  import chunter, { chunterId } from '@hcengineering/chunter'
  import type { Location } from '@hcengineering/ui'
  import { IconClose, Label, location, navigate } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import type { WithLookup, Ref } from '@hcengineering/core'
  import type { Attachment } from '@hcengineering/attachment'
  import attachment from '@hcengineering/attachment'
  import presentation, { createQuery, LiteMessageViewer, getClient } from '@hcengineering/presentation'
  import activity from '@hcengineering/activity'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import type { Person } from '@hcengineering/contact'
  import { formatName } from '@hcengineering/contact'
  import { AttachmentMiniPreview, isVoiceAttachment } from '@hcengineering/attachment-resources'
  import { isEmptyMarkup } from '@hcengineering/text'
  import type { IntlString } from '@hcengineering/platform'
  import { encodeChatURI } from '../navigation'
  import { setFilters } from '@hcengineering/view-resources'

  export let replyTo: WithLookup<ChatMessage>
  export let labelIntl: IntlString = activity.string.ReplyTo
  export let canClose = true

  const dispatch = createEventDispatcher()

  const attachmentsQuery = createQuery()

  let attachments: Attachment[] = []
  let person: Person | undefined

  $: hasContent = (replyTo.attachments ?? 0) > 0 || !isEmptyMarkup(replyTo.message)
  $: hasAttachments = (replyTo.attachments ?? 0) > 0
  $: lookupAttachments = replyTo.$lookup?.attachments as Attachment[] | undefined
  $: personId = replyTo.createdBy ?? replyTo.modifiedBy
  // A forward shows the files it carries when it has none of its own.
  $: files = attachments.length > 0 ? attachments : hasContent ? [] : (replyTo.forwardContent?.attachments ?? [])
  $: file = files[0]

  $: {
    if (lookupAttachments != null) {
      attachments = lookupAttachments
      attachmentsQuery.unsubscribe()
    } else if (hasAttachments) {
      attachmentsQuery.query(attachment.class.Attachment, { attachedTo: replyTo._id }, (res) => {
        attachments = res
      })
    } else {
      attachments = []
      attachmentsQuery.unsubscribe()
    }
  }

  let lastPersonId: string | undefined

  $: if (personId !== lastPersonId) {
    lastPersonId = personId

    if (personId != null) {
      getPersonByPersonIdCb(personId, (p) => {
        person = p ?? undefined
      })
    } else {
      person = undefined
    }
  }

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let parentMessage: ChatMessage | undefined = undefined
  $: isThreadMessage = hierarchy.isDerived(replyTo.attachedToClass, activity.class.ActivityMessage)

  $: if (isThreadMessage && parentMessage?._id !== replyTo.attachedTo) {
    void client.findOne(chunter.class.ChatMessage, { _id: replyTo.attachedTo as Ref<ChatMessage> }).then((res) => {
      parentMessage = res
    })
  } else {
    parentMessage = undefined
  }

  $: loc = createLocation($location, replyTo, parentMessage)

  function createLocation (loc: Location, message: ChatMessage, parentMsg?: ChatMessage): Location | undefined {
    if (message == null) return undefined
    const newLocation: Location = {
      path: [...loc.path]
    }
    newLocation.path[2] = chunterId

    if (hierarchy.isDerived(message.attachedToClass, activity.class.ActivityMessage)) {
      if (parentMsg == null) return undefined
      newLocation.path[3] = encodeChatURI(parentMsg.attachedTo, parentMsg.attachedToClass)
      newLocation.path[4] = message.attachedTo
      newLocation.path.length = 5
    } else {
      newLocation.path[3] = encodeChatURI(message.attachedTo, message.attachedToClass)
      newLocation.path.length = 4
    }

    newLocation.query = { message: message._id }
    return newLocation
  }

  function handleClick (e: MouseEvent | KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || loc == null) return
    e.preventDefault()
    e.stopPropagation()

    setFilters([])
    navigate(loc)
  }

  function handleClose (): void {
    dispatch('delete')
  }

  function handleKeyDown (e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleClick(e)
    }
  }
</script>

<div class="reply" role="button" tabindex="0" on:click={handleClick} on:keydown={handleKeyDown}>
  <div class="reply__indicator"></div>

  <div class="reply__content">
    {#if file != null}
      <AttachmentMiniPreview value={file} />
    {/if}

    <div class="reply__body">
      <div class="reply__header">
        <Label label={labelIntl} params={{ name: formatName(person?.name ?? '') }} />
      </div>

      <div class="reply__text">
        {#if !isEmptyMarkup(replyTo.message)}
          <LiteMessageViewer message={replyTo.message} />
        {:else if !hasAttachments && !isEmptyMarkup(replyTo.forwardContent?.message ?? '')}
          <LiteMessageViewer message={replyTo.forwardContent?.message ?? ''} />
        {:else if file != null}
          <span class="reply__file">
            <span class="reply__file-name">
              {#if isVoiceAttachment(hierarchy, file)}
                <Label label={attachment.string.VoiceMessage} />
              {:else}
                {file.name}
              {/if}
            </span>
            {#if files.length > 1}<span class="reply__more">+{files.length - 1}</span>{/if}
          </span>
        {:else if hasAttachments}
          <span class="reply__attachment-label">
            <Label label={attachment.string.Attachments} />
          </span>
        {/if}
      </div>
    </div>
  </div>

  {#if canClose}
    <IconButton
      icon={IconClose}
      kind="tertiary"
      size="small"
      tooltip={{ label: presentation.string.Close }}
      on:click={handleClose}
    />
  {/if}
</div>

<style lang="scss">
  .reply {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
    height: 3rem;
    padding-right: 0.375rem;
    overflow: hidden;

    &__indicator {
      width: 0.25rem;
      height: 100%;
      background-color: var(--accent-color-base);
      border-radius: var(--small-BorderRadius);
    }

    &__content {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      gap: 0.5rem;
      overflow: hidden;
      height: 100%;
    }

    &__body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 0.25rem;
    }

    &__header {
      font-weight: 500;
      font-size: 0.85rem;
      color: var(--accent-color-base);
    }

    &__text {
      font-size: 0.925rem;

      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-height: 1.25rem;
      height: 1.25rem;
      min-height: 1.25rem;
    }

    &__attachment-label {
      color: var(--global-secondary-TextColor);
    }

    &__file {
      display: flex;
      align-items: baseline;
      gap: 0.375rem;
      min-width: 0;
      color: var(--global-secondary-TextColor);
    }

    &__file-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__more {
      flex-shrink: 0;
      font-weight: 500;
    }
  }
</style>
