<!--
// Moderation card: an ActivityInfoMessage the server drops into an owner's direct message with the
// system when someone reports a message or a person. Built from props in the viewer's language; the
// markup the server renders is for clients without this presenter. Owners act on it right here.
-->
<script lang="ts">
  import type { ActivityInfoMessage } from '@hcengineering/activity'
  import { ActivityMessageTemplate, MessageTimestamp } from '@hcengineering/activity-resources'
  import { AttachmentDocList } from '@hcengineering/attachment-resources'
  import chunter, { type ChatMessage, type ContentReportReason } from '@hcengineering/chunter'
  import contact, { type Person, formatName } from '@hcengineering/contact'
  import { Avatar, PersonPresenter, SystemAvatar, getPersonByPersonIdCb } from '@hcengineering/contact-resources'
  import {
    AccountRole,
    type AccountUuid,
    type Class,
    type Doc,
    type Ref,
    getCurrentAccount,
    hasAccountRole
  } from '@hcengineering/core'
  import { MessageViewer, createQuery, getClient } from '@hcengineering/presentation'
  import { IconError, Label, ModernButton, type Action as UIAction, showPopup } from '@hcengineering/ui'
  import view, { type Action } from '@hcengineering/view'
  import { invokeAction } from '@hcengineering/view-resources'

  import { openChannel, openMessageFromSpecial } from '../navigation'
  import { reasonLabels } from '../report'
  import DeleteMessageConfirmationPopup from './DeleteMessageConfirmationPopup.svelte'

  export let value: ActivityInfoMessage
  export let showNotify: boolean = false
  export let isHighlighted: boolean = false
  export let isSelected: boolean = false
  export let shouldScroll: boolean = false
  export let embedded: boolean = false
  export let withActions: boolean = true
  export let actions: UIAction[] = []
  export let hoverable = true
  export let hoverStyles: 'filledHover' = 'filledHover'
  export let readonly: boolean = false
  export let timeFormat: 'time' | 'full' = 'time'
  export let onClick: (() => void) | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()
  // Cards reach workspace owners only; the actions are theirs alone.
  const canModerate = hasAccountRole(getCurrentAccount(), AccountRole.Owner)
  // The contact plugin's own Kick action: its confirmation and account-service call are reused.
  const kickAction: Action | undefined = client
    .getModel()
    .findAllSync(view.class.Action, { _id: 'contact:action:KickEmployee' as Ref<Action> })[0]

  $: props = value.props ?? {}
  $: kind = props.kind === 'person' ? 'person' : 'message'
  $: reason = (props.reason as ContentReportReason) in reasonLabels ? (props.reason as ContentReportReason) : 'other'
  $: reporter = props.reporter as AccountUuid | undefined
  $: author = props.author as AccountUuid | undefined
  $: chatOpenable =
    props.chat != null && hierarchy.isDerived(props.chatClass as Ref<Class<Doc>>, chunter.class.ChunterSpace)

  // The props name the accounts; the chips want the persons behind them.
  let persons = new Map<AccountUuid, Person>()
  $: void loadPersons([reporter, author].filter((it): it is AccountUuid => it != null))
  async function loadPersons (accounts: AccountUuid[]): Promise<void> {
    const found = await client.findAll(contact.class.Person, { personUuid: { $in: accounts } })
    persons = new Map(found.map((p) => [p.personUuid as unknown as AccountUuid, p]))
  }

  // The reported message itself: the quote shows it live and names its author, so the About row
  // appears only without a quote (a report on a person, or a message already deleted).
  const messageQuery = createQuery()
  let message: ChatMessage | undefined
  let messageLoaded = false
  $: messageId = props.messageId as Ref<ChatMessage> | undefined
  $: if (messageId != null) {
    messageQuery.query(chunter.class.ChatMessage, { _id: messageId }, (res) => {
      message = res[0]
      messageLoaded = true
    })
  } else {
    // No messageId: the server stripped it when the message was deleted.
    messageQuery.unsubscribe()
    message = undefined
    messageLoaded = true
  }

  // The quoted message's author, by the social id the message was written with.
  let messageAuthor: Person | undefined
  $: if (message !== undefined) {
    getPersonByPersonIdCb(message.createdBy ?? message.modifiedBy, (p) => {
      messageAuthor = p ?? undefined
    })
  }

  async function open (): Promise<void> {
    await openMessageFromSpecial(message)
  }

  function openChat (): void {
    if (chatOpenable) openChannel(props.chat as string, props.chatClass as Ref<Class<Doc>>)
  }

  function remove (): void {
    if (message === undefined) return
    showPopup(DeleteMessageConfirmationPopup, { message }, 'center')
  }

  async function kick (evt: Event): Promise<void> {
    if (author == null || kickAction === undefined) return
    const person = persons.get(author) ?? (await client.findOne(contact.class.Person, { personUuid: author }))
    if (person === undefined) return
    await invokeAction(person, evt, kickAction)
  }
</script>

<ActivityMessageTemplate
  message={value}
  parentMessage={undefined}
  person={undefined}
  {showNotify}
  {isHighlighted}
  {isSelected}
  {shouldScroll}
  {embedded}
  {withActions}
  {actions}
  {hoverable}
  {hoverStyles}
  viewlet={undefined}
  {readonly}
  {timeFormat}
  {onClick}
  skipLabel
>
  <svelte:fragment slot="icon">
    <SystemAvatar size="medium" />
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div class="report">
      <div class="report__header">
        <span class="report__badge"><IconError size="small" /></span>
        <span class="report__heading">
          <span class="report__title"><Label label={chunter.string.ContentReportTitle} params={{ kind }} /></span>
          <span class="report__reason"><Label label={reasonLabels[reason]} /></span>
        </span>
      </div>

      <div class="report__rows">
        <span class="report__key"><Label label={chunter.string.ContentReportFrom} /></span>
        <span class="report__value">
          {#if reporter !== undefined && persons.has(reporter)}
            <PersonPresenter value={persons.get(reporter)} avatarSize="card" compact />
          {:else}
            {props.reporterName ?? ''}
          {/if}
        </span>
        {#if message === undefined}
          <span class="report__key"><Label label={chunter.string.ContentReportAbout} /></span>
          <span class="report__value">
            {#if author !== undefined && persons.has(author)}
              <PersonPresenter value={persons.get(author)} avatarSize="card" compact />
            {:else}
              {props.authorName ?? ''}
            {/if}
          </span>
        {/if}
        {#if props.chatName}
          <span class="report__key"><Label label={chunter.string.ContentReportWhere} /></span>
          <span class="report__value">
            {#if chatOpenable}
              <button class="report__chat" on:click|stopPropagation={openChat}>{props.chatName}</button>
            {:else}
              <span>{props.chatName}</span>
            {/if}
          </span>
        {/if}
      </div>

      {#if kind === 'message'}
        {#if message !== undefined}
          <div
            class="report__message"
            role="button"
            tabindex="0"
            on:click|stopPropagation={open}
            on:keydown={(e) => e.key === 'Enter' && open()}
          >
            <div class="report__message-header">
              {#if messageAuthor}
                <Avatar size="x-small" person={messageAuthor} name={messageAuthor.name} />
                <span class="report__message-author">{formatName(messageAuthor.name)}</span>
              {:else}
                <span class="report__message-author">{props.authorName ?? ''}</span>
              {/if}
              <span class="report__message-time">
                <MessageTimestamp date={message.createdOn ?? message.modifiedOn} format="time" />
              </span>
            </div>
            <div class="report__message-body">
              <MessageViewer message={message.message} />
              <AttachmentDocList value={message} imageSize="medium" />
            </div>
          </div>
        {:else if messageLoaded}
          <div class="report__gone">
            {#if props.quote}
              <span class="report__quote-text">{props.quote}</span>
            {/if}
            <span class="report__gone-label"><Label label={chunter.string.ContentReportMessageGone} /></span>
          </div>
        {/if}
      {/if}

      {#if canModerate && !readonly}
        <div class="report__actions">
          {#if message !== undefined}
            <ModernButton
              icon={view.icon.Delete}
              label={chunter.string.ContentReportDeleteMessage}
              kind="secondary"
              size="small"
              on:click={remove}
            />
          {/if}
          {#if kickAction !== undefined && author !== undefined}
            <ModernButton
              icon={contact.icon.KickUser}
              label={kickAction.label}
              kind="secondary"
              size="small"
              on:click={kick}
            />
          {/if}
        </div>
      {/if}
    </div>
  </svelte:fragment>
</ActivityMessageTemplate>

<style lang="scss">
  .report {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.5rem;
    width: fit-content;
    min-width: 22rem;
    max-width: 32rem;
    padding: 1rem 1.25rem 1.25rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--global-primary-TextColor);
    border: 1px solid var(--global-surface-01-BorderColor);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--global-surface-01-BackgroundColor);

    &__header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    &__badge {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 2.25rem;
      height: 2.25rem;
      // The look of the platform's error banner, icon only.
      border-radius: 0.5rem;
      color: #da3633;
      background-color: rgba(218, 54, 51, 0.08);
      border: 1px solid rgba(218, 54, 51, 0.25);
    }

    &__heading {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    &__title {
      font-weight: 500;
    }

    &__reason {
      color: var(--global-secondary-TextColor);
    }

    &__rows {
      display: grid;
      grid-template-columns: 5rem 1fr;
      row-gap: 0.5rem;
      align-items: center;
    }

    &__key {
      color: var(--global-secondary-TextColor);
    }

    &__value {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }

    &__chat {
      padding: 0;
      font: inherit;
      color: var(--global-primary-LinkColor);
      background: none;
      border: none;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    &__message {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 0.75rem 1rem;
      color: var(--global-primary-TextColor);
      background-color: var(--global-surface-02-BackgroundColor);
      border: 1px solid var(--global-surface-02-BorderColor);
      border-left: 0.1875rem solid var(--accent-color-base);
      border-radius: var(--small-BorderRadius);
      cursor: pointer;

      &:hover {
        background-color: var(--global-surface-03-hover-BackgroundColor);
      }
    }

    &__message-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    &__message-author {
      font-weight: 500;
    }

    &__message-time {
      font-size: 0.75rem;
      color: var(--global-tertiary-TextColor);
    }

    &__message-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 0;
      // About six lines; anything longer fades out, the click opens the whole message.
      max-height: 7.5rem;
      overflow: hidden;
      overflow-wrap: anywhere;
      mask-image: linear-gradient(to bottom, #000 80%, transparent);
    }

    &__gone {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0.75rem;
      color: var(--global-secondary-TextColor);
      border-left: 0.1875rem solid var(--global-surface-02-BorderColor);
    }

    &__quote-text {
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    &__gone-label {
      font-size: 0.8125rem;
      color: var(--global-tertiary-TextColor);
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  }
</style>
