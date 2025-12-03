<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { PersonPreviewProvider, Avatar } from '@hcengineering/contact-resources'
  import { formatName, Person } from '@hcengineering/contact'
  import { Message } from '@hcengineering/communication-types'
  import { Doc, isToday } from '@hcengineering/core'

  import MessageContentViewer from './MessageContentViewer.svelte'
  import MessageFooter from './MessageFooter.svelte'
  import MessageTimestamp from './MessageTimestamp.svelte'
  import { DateFormat } from '../../types'

  export let doc: Doc
  export let author: Person | undefined
  export let message: Message
  export let hideAvatar: boolean = false
  export let hideHeader: boolean = false
  export let dateFormat: DateFormat | undefined = undefined
  export let compact = false
</script>

{#if compact}
  {@const today = isToday(message.created.getTime()) }
  <div class="message__body compact">
    <div class="w-10 min-w-10"/>
    <div class="message__username notVisible">
      {formatName(author?.name ?? '')}
    </div>

    <div class="time-container" class:time={today || dateFormat === DateFormat.Time} class:default={!today && dateFormat === DateFormat.Default}>
      <div class="message__time message--time_hoverable">
        <div class="message__date" class:compact>
          <MessageTimestamp date={message.created}/>
        </div>
      </div>
    </div>

    <div class="message__text">
      <MessageContentViewer {message} {doc} {author} {compact}/>
    </div>
  </div>
  <div class="message__footer">
    <MessageFooter {message} />
  </div>
  {:else }
<div class="message__body">
  {#if !hideAvatar}
    <div class="message__avatar">
      <PersonPreviewProvider value={author}>
        <Avatar name={author?.name} person={author} size="medium" />
      </PersonPreviewProvider>
    </div>
  {/if}
  {#if !hideHeader}
    <div class="message__header">
      <PersonPreviewProvider value={author}>
        <div class="message__username">
          {formatName(author?.name ?? '')}
        </div>
      </PersonPreviewProvider>
      <div class="message__date">
      <MessageTimestamp date={message.created} format={dateFormat}/>
      </div>
    </div>
  {/if}

  <div class="message__text">
    <MessageContentViewer {message} {doc} {author} />
  </div>
</div>
<div class="message__footer">
  <MessageFooter {message} />
</div>
{/if}

<style lang="scss">
  .message__body {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;

    &.compact {
      min-height: 1.5rem;
    }
  }

  .message__avatar {
    display: flex;
    flex-direction: column;
    align-items: center;
    //justify-content: center;
    width: 2.5rem;
    min-width: 2.5rem;
    height: 100%;
  }

  .message__header {
    display: flex;
    gap: 0.375rem;
    height: 100%;
  }

  .message__username {
    color: var(--global-primary-TextColor);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    height: 2.5rem;
    display: flex;
    align-items: center;

    &.notVisible {
      visibility: hidden;
      height: auto;
    }
  }

  .message__text {
    color: var(--global-primary-TextColor);
    font-size: 0.875rem;
    font-style: normal;
    font-weight: 400;

    display: flex;
    overflow: hidden;
    min-width: 0;
    max-width: 100%;
    user-select: text;
  }

  .message__footer {
    display: flex;
    flex-direction: column;
    margin-left: 3.5rem;
  }

  .time-container {
    position: relative;

    margin-left: -1rem;
    height: 100%;

    &.time {
      min-width: 2.5rem;
    }

    &.default {
      min-width: 5rem;
    }
  }

  .message__time {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 1.313rem;
    right: 0;
    top: 0;
    visibility: hidden;
  }

  .message__date {
    color: var(--global-tertiary-TextColor);
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    display: flex;
    align-items: center;
    height: 2.5rem;

    &.compact {
      height: auto;
    }
  }
</style>
