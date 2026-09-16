<!--
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
  import activity from '@hcengineering/activity'
  import core from '@hcengineering/core'
  import { Avatar, SystemAvatar } from '@hcengineering/contact-resources'
  import { MessageTimestamp } from '@hcengineering/activity-resources'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import { Icon, Label } from '@hcengineering/ui'
  import { type Asset } from '@hcengineering/platform'

  import type { SearchResultRow } from '../../../search/types'
  import HighlightedText from './HighlightedText.svelte'

  export let row: SearchResultRow
  export let showChannel: boolean = true

  const hierarchy = getClient().getHierarchy()

  $: icon = iconFor(row.attachedToClass)

  function iconFor (_class: SearchResultRow['attachedToClass']): Asset | undefined {
    if (_class === undefined) return undefined
    try {
      return hierarchy.getClass(_class).icon
    } catch {
      return undefined
    }
  }
</script>

<div class="result">
  <div class="avatar">
    {#if row.person !== undefined}
      <Avatar person={row.person} name={row.person.name} size={'medium'} showPreview />
    {:else}
      <SystemAvatar size={'medium'} />
    {/if}
  </div>
  <div class="body">
    <div class="header">
      {#if row.person !== undefined}
        <span class="author">
          <ComponentExtensions
            extension={activity.extension.ActivityEmployeePresenter}
            props={{ person: row.person }}
          />
        </span>
      {:else}
        <span class="author"><Label label={core.string.System} /></span>
      {/if}
      {#if showChannel && row.channel !== ''}
        <span class="reference flex-row-center flex-no-shrink flex-gap-1">
          {#if icon !== undefined}
            <div class="icon"><Icon {icon} size={'x-small'} /></div>
          {/if}
          <span class="label overflow-label font-medium-12 text-left max-w-20 secondary-textColor">
            {row.channel}
          </span>
        </span>
      {/if}
      {#if row.createdOn !== undefined}
        <span class="time"><MessageTimestamp date={row.createdOn} format={'full'} /></span>
      {/if}
    </div>
    <div class="content">
      <HighlightedText markup={row.markup} fragments={row.highlights} />
    </div>
  </div>
</div>

<style lang="scss">
  .result {
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    min-width: 0;
  }

  .avatar {
    flex-shrink: 0;
    padding-top: 0.125rem;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex-grow: 1;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .author {
    font-weight: 500;
    color: var(--theme-caption-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
    white-space: nowrap;
    margin-left: auto;
    flex-shrink: 0;
  }

  .reference {
    height: 1.25rem;
    padding: 0 var(--spacing-0_75) 0 var(--spacing-0_5);
    box-shadow: inset 0 0 0 1px var(--global-subtle-ui-BorderColor);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--tag-nuance-SkyBackground);
  }

  .icon {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
  }

  .label {
    flex-grow: 1;
    flex-shrink: 1;
    display: flex;
    align-items: center;
  }

  .content {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
  @media (max-width: 480px) {
    .result {
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
    }

    .header {
      flex-wrap: wrap;
      gap: 0.25rem 0.375rem;
    }

    .time {
      margin-left: 0;
    }
  }
</style>
