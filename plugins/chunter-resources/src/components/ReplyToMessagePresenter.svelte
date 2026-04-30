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
  import chunter, { ChatMessage, chunterId } from '@hcengineering/chunter'
  import { ButtonIcon, IconClose, Label, location, Location, navigate } from '@hcengineering/ui'
  import { WithLookup, Ref } from '@hcengineering/core'
  import attachment, { Attachment } from '@hcengineering/attachment'
  import { createQuery, LiteMessageViewer, getClient } from '@hcengineering/presentation'
  import activity from '@hcengineering/activity'
  import { getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import { formatName, Person } from '@hcengineering/contact'
  import { AttachmentSimplePreview } from '@hcengineering/attachment-resources'
  import { isEmptyMarkup } from '@hcengineering/text'
  import { IntlString } from '@hcengineering/platform'
  import { encodeObjectURI } from '@hcengineering/view'
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
      newLocation.path[3] = encodeObjectURI(parentMsg.attachedTo, parentMsg.attachedToClass)
      newLocation.path[4] = message.attachedTo
      newLocation.path.length = 5
    } else {
      newLocation.path[3] = encodeObjectURI(message.attachedTo, message.attachedToClass)
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

  function handleClose (e: MouseEvent): void {
    e.stopPropagation()
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
    {#if hasAttachments || (!hasContent && (replyTo.forwardContent?.attachments?.length ?? 0) > 0)}
      {@const attach = attachments[0] ?? replyTo.forwardContent?.attachments?.[0]}
      <div class="reply__attachments">
        {#if attach != null}
          <AttachmentSimplePreview value={attach} />
        {/if}
      </div>
    {/if}

    <div class="reply__body">
      <div class="reply__header">
        <Label label={labelIntl} params={{ name: formatName(person?.name ?? '') }} />
      </div>

      <div class="reply__text">
        {#if !isEmptyMarkup(replyTo.message)}
          <LiteMessageViewer message={replyTo.message} />
        {:else if hasAttachments}
          <span class="reply__attachment-label">
            <Label label={attachment.string.Attachments} />
          </span>
        {:else if !isEmptyMarkup(replyTo.forwardContent?.message ?? '')}
          <LiteMessageViewer message={replyTo.forwardContent?.message ?? ''} />
        {:else if (replyTo.forwardContent?.attachments?.length ?? 0) > 0}
          <span class="reply__attachment-label">
            <Label label={attachment.string.Attachments} />
          </span>
        {/if}
      </div>
    </div>
  </div>

  {#if canClose}
    <ButtonIcon icon={IconClose} kind="tertiary" size="small" on:click={handleClose} />
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
      flex: 1;
      min-width: 0;
      gap: 0.5rem;
      overflow: hidden;
    }

    &__attachments {
      display: flex;
      align-items: center;
      justify-content: center;

      width: 2.875rem;
      height: 2.875rem;
      flex-shrink: 0;

      border-radius: var(--medium-BorderRadius);
      background-color: var(--surface-secondary);
      font-size: 0.85rem;
      overflow: hidden;
    }

    &__body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 0.375rem;
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
  }
</style>
