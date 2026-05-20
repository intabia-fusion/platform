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
  import core, { Class, Doc, generateId, getDay, Ref, Space, WithLookup } from '@hcengineering/core'
  import { ChatMessage, chunterId } from '@hcengineering/chunter'
  import { createQuery, getClient, MessageViewer } from '@hcengineering/presentation'
  import attachment, { Attachment } from '@hcengineering/attachment'
  import activity, { ActivityMessage } from '@hcengineering/activity'
  import { getPersonByPersonIdCb, PersonPresenter } from '@hcengineering/contact-resources'
  import { Person } from '@hcengineering/contact'
  import ui, {
    Icon,
    Label,
    Location,
    locationToUrl,
    navigate,
    ShowMore,
    location,
    getCurrentLocation
  } from '@hcengineering/ui'
  import { AttachmentList } from '@hcengineering/attachment-resources'
  import { getDocIdentifier, getDocTitle, setFilters } from '@hcengineering/view-resources'

  import chunter from '../plugin'
  import { encodeObjectURI } from '@hcengineering/view'

  export let object: Doc | undefined
  export let parent: WithLookup<ChatMessage>

  const query = createQuery()
  const client = getClient()
  const hierarchy = client.getHierarchy()

  let forwardedMessage: WithLookup<ChatMessage> | undefined = undefined
  let forwardedFromDoc: Doc | undefined = undefined
  let forwardedFromLoaded = false
  let forwardedFromTitle: string | undefined = undefined
  let forwardedFromIdentifier: string | undefined = undefined

  $: if (object && object?._id === parent.forwardFromId) {
    forwardedFromDoc = object
    forwardedFromLoaded = true
  } else if (forwardedFromDoc == null && parent.forwardFromId != null && parent.forwardFromClass != null) {
    void client.findOne(parent.forwardFromClass, { _id: parent.forwardFromId }).then((doc) => {
      forwardedFromDoc = doc
      forwardedFromLoaded = true
    })
  } else if (forwardedFromDoc?._id !== parent.forwardFromId) {
    forwardedFromDoc = undefined
    forwardedFromTitle = undefined
    forwardedFromIdentifier = undefined
  }

  $: if (parent.forwardedMessage != null) {
    if (parent.$lookup?.forwardedMessage != null) {
      forwardedMessage = parent.$lookup.forwardedMessage as WithLookup<ChatMessage>
      query.unsubscribe()
    } else {
      query.query(
        chunter.class.ChatMessage,
        { _id: parent.forwardedMessage as Ref<ChatMessage> },
        (res) => {
          forwardedMessage = res[0]
        },
        {
          limit: 1,
          lookup: {
            _id: {
              attachments: attachment.class.Attachment
            }
          }
        }
      )
    }
  } else {
    forwardedMessage = undefined
    query.unsubscribe()
  }

  $: personId = forwardedMessage?.createdBy ?? forwardedMessage?.modifiedBy ?? parent.forwardContent?.author
  let person: Person | undefined
  $: if (personId !== undefined) {
    getPersonByPersonIdCb(personId, (p) => {
      person = p ?? undefined
    })
  } else {
    person = undefined
  }

  $: fromId = forwardedFromDoc?._id ?? parent.forwardFromId
  $: fromClass = forwardedFromDoc?._class ?? parent.forwardFromClass
  $: fromClazz = fromClass ? hierarchy.findClass(fromClass) : undefined

  $: isOtherDoc = parent.attachedTo !== parent.forwardFromId
  $: attachments = getAttachments(parent, forwardedMessage)

  $: originalTime = forwardedMessage?.createdOn ?? parent?.forwardContent?.createdOn ?? 0
  $: time = getDay(originalTime)
  $: isToday = time === getDay(Date.now())
  $: isYesterday = time === getDay(new Date().setDate(new Date().getDate() - 1))
  $: isCurrentYear = time ? new Date(time).getFullYear() === new Date().getFullYear() : undefined

  $: loc = createLocation($location, fromId, fromClass, forwardedFromDoc)
  $: href = loc ? locationToUrl(loc) : undefined

  function getAttachments (parent: ChatMessage, forwardedMessage: WithLookup<ChatMessage> | undefined): Attachment[] {
    const _id = forwardedMessage?._id ?? parent.forwardedMessage
    if (_id == null) return []

    if (forwardedMessage?.$lookup?.attachments != null) {
      return (forwardedMessage?.$lookup?.attachments ?? []) as Attachment[]
    }

    return (
      parent.forwardContent?.attachments?.map((it) => ({
        _id: generateId(),
        _class: attachment.class.Attachment,
        attachedTo: _id,
        attachedToClass: activity.class.ActivityMessage,
        space: forwardedMessage?.space ?? core.space.Workspace,
        ...it,
        lastModified: it.createdOn,
        collection: 'attachments',
        modifiedOn: it.createdOn,
        createdBy: core.account.System,
        modifiedBy: core.account.System
      })) ?? []
    )
  }

  $: void updateForwardedFromTitle(forwardedFromDoc)
  $: void updateForwardedFromIdentifier(forwardedFromDoc)

  async function updateForwardedFromTitle (doc: Doc | undefined): Promise<void> {
    if (doc == null) {
      forwardedFromTitle = undefined
      return
    }

    if (hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
      forwardedFromTitle = undefined
      return
    }

    forwardedFromTitle = await getDocTitle(client, doc._id, doc._class, doc)
  }

  async function updateForwardedFromIdentifier (doc: Doc | undefined): Promise<void> {
    if (doc == null) {
      forwardedFromIdentifier = undefined
      return
    }

    if (hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
      forwardedFromIdentifier = undefined
      return
    }

    forwardedFromIdentifier = await getDocIdentifier(client, doc._id, doc._class, doc)
  }

  function isPrivate (doc?: Doc): boolean {
    if (doc == null) return true
    if (hierarchy.isDerived(doc._class, core.class.Space)) {
      const space = doc as Space
      return space.private
    }

    return false
  }

  function createLocation (_loc: Location, _id?: Ref<Doc>, _class?: Ref<Class<Doc>>, doc?: Doc): Location | undefined {
    if (_id == null || _class == null || doc == null) return undefined
    const location: Location = {
      path: [...getCurrentLocation().path]
    }

    if (isOtherDoc) {
      location.path[2] = chunterId
      if (hierarchy.isDerived(_class, activity.class.ActivityMessage)) {
        const message = doc as ActivityMessage
        location.path[3] = encodeObjectURI(message.attachedTo, message.attachedToClass)
        location.path[4] = message._id
        location.path.length = 5
      } else {
        location.path[3] = encodeObjectURI(_id, _class)
        location.path.length = 4
      }
    }

    location.query = { message: parent.forwardedMessage ?? null }
    return location
  }

  function handleClick (e: MouseEvent | KeyboardEvent): void {
    if (forwardedFromDoc == null) return
    if (e.metaKey || e.ctrlKey || loc == null) return
    e.preventDefault()
    e.stopPropagation()

    setFilters([])
    navigate(loc)
  }

  function handleKeyDown (e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      handleClick(e)
    }
  }

  async function getThreadParentName (doc: Doc): Promise<string> {
    const thread = doc as ActivityMessage

    return (
      (await getDocIdentifier(client, thread.attachedTo, thread.attachedToClass)) ??
      (await getDocTitle(client, thread.attachedTo, thread.attachedToClass)) ??
      ''
    )
  }
</script>

{#if parent.forwardFromId != null}
  <div class="forwarded-message" role="button" tabindex="0" on:click={handleClick} on:keydown={handleKeyDown}>
    <div class="forwarded-message__indicator"></div>
    <div class="forwarded-message__content">
      <div class="forwarded-message__header">
        {#if isOtherDoc}
          <Label label={activity.string.ForwardedFrom} />
        {/if}
        <PersonPresenter value={person} avatarSize="card" accent />
      </div>
      <div class="forwarded-message__text">
        <ShowMore>
          <MessageViewer message={forwardedMessage?.message ?? parent.forwardContent?.message ?? ''} />
        </ShowMore>
      </div>
      {#if attachments.length > 0}
        <div class="forwarded-message__attachments">
          <AttachmentList {attachments} imageSize="medium" withActions={false} />
        </div>
      {/if}
      {#if isOtherDoc}
        <div
          class="forwarded-message__from"
          role="button"
          tabindex="0"
          class:disabled={forwardedFromDoc == null}
          on:click={handleClick}
          on:keydown={handleKeyDown}
        >
          {#if isPrivate(forwardedFromDoc)}
            <Icon icon={chunter.icon.Lock} size="small" />
          {:else}
            <Icon icon={fromClazz?.icon ?? chunter.icon.Hashtag} size="small" />
          {/if}

          <a class="forwarded-message__from__title" {href} on:click={handleClick}>
            {#if forwardedFromDoc}
              {#if forwardedFromIdentifier}
                {forwardedFromIdentifier}
              {:else if forwardedFromTitle}
                {forwardedFromTitle}
              {:else if hierarchy.isDerived(forwardedFromDoc._class, activity.class.ActivityMessage)}
                {#await getThreadParentName(forwardedFromDoc) then name}
                  <Label label={chunter.string.ThreadIn} params={{ name }} />
                {/await}
              {:else}
                <Label label={fromClazz?.label ?? chunter.string.Chat} />
              {/if}
            {:else if forwardedFromLoaded}
              <Label label={chunter.string.PrivateChat} />
            {/if}
          </a>

          <div class="forwarded-message__from__separator" />

          <a class="forwarded-message__from__time" {href} on:click={handleClick}>
            {#if isToday || isYesterday}
              <Label label={isToday ? ui.string.Today : ui.string.Yesterday} />, {new Date(
                originalTime
              ).toLocaleTimeString('default', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            {:else}
              {new Date(time).toLocaleDateString('default', {
                weekday: 'short',
                month: 'long',
                day: 'numeric',
                year: isCurrentYear ? undefined : 'numeric'
              })}
            {/if}
          </a>

          <!--{#if forwardedFromDoc}-->
          <!--  <div class="forwarded-message__from__separator" />-->
          <!--  <a class="forwarded-message__from__view" {href} on:click={handleClick}>-->
          <!--    <Label label={chunter.string.ShowMessage} />-->
          <!--  </a>-->
          <!--{/if}-->
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .forwarded-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    max-width: 40rem;

    &__indicator {
      display: flex;
      width: 0.25rem;
      align-self: stretch;
      background-color: var(--accent-color-base);
      border-radius: var(--small-BorderRadius);
    }

    &__content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      gap: 0.5rem;
      padding: 0.25rem 0;
    }

    &__attachments {
      display: flex;
    }

    &__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
      color: var(--theme-caption-color);
    }

    &__text {
      position: relative;
    }

    &__from {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem;
      min-width: 0;
      cursor: pointer;
      color: var(--global-secondary-TextColor);

      &.disabled {
        cursor: default;
      }

      &__title {
        font-weight: 500;
        color: inherit;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 1;
        min-width: 0;
      }

      &__separator {
        background: var(--global-surface-01-BorderColor);
        height: 0.875rem;
        width: 1px;
        border-radius: var(--small-BorderRadius);
        margin: 0 0.125rem;
        flex-shrink: 0;
      }

      &__time {
        color: inherit;
        font-weight: 400;
        font-size: 0.75rem;
        white-space: nowrap;
        flex-shrink: 0;
      }

      &__view {
        color: var(--accent-color-base);
        font-weight: 400;
        font-size: 0.75rem;
        white-space: nowrap;
        flex-shrink: 0;
      }
    }
  }
</style>
