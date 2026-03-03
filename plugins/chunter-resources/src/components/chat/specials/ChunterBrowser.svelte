<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import attachment from '@hcengineering/attachment'
  import { FileBrowser } from '@hcengineering/attachment-resources'
  import { Scroller, Switcher } from '@hcengineering/ui'
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import contact from '@hcengineering/contact'
  import MessagesBrowser from './MessagesBrowser.svelte'
  import { FilterBar, FilterButton } from '@hcengineering/view-resources'
  import { Class, Doc, DocumentQuery, Ref } from '@hcengineering/core'
  import ChunterSpacesView from './ChunterSpacesView.svelte'
  import { IntlString } from '@hcengineering/platform'

  import { userSearch } from '../../../index'
  import { SearchType } from '../../../utils'
  import chunter from '../../../plugin'
  import Header from '../../Header.svelte'

  let userSearch_: string = ''
  userSearch.subscribe((v) => (userSearch_ = v))

  const localStorageKey = 'chunter-browser-st__v1'
  const saved = localStorage.getItem(localStorageKey)
  let searchType: SearchType = saved ? parseInt(saved, 10) : SearchType.Messages
  $: localStorage.setItem(localStorageKey, searchType.toString())

  const tabs = [
    {
      id: SearchType.Messages,
      icon: chunter.icon.Messages,
      labelIntl: chunter.string.Messages,
      tooltip: chunter.string.Messages
    },
    {
      id: SearchType.Files,
      icon: attachment.icon.FileBrowser,
      labelIntl: attachment.string.Files,
      tooltip: attachment.string.Files
    },
    {
      id: SearchType.Channels,
      icon: chunter.icon.Chunter,
      labelIntl: chunter.string.Channels,
      tooltip: chunter.string.Channels
    },
    {
      id: SearchType.Directs,
      icon: contact.icon.Contacts,
      labelIntl: chunter.string.DirectMessages,
      tooltip: chunter.string.DirectMessages
    }
  ]

  const components: {
    component: AnySvelteComponent
    searchType: SearchType
    label: IntlString
    filterClass?: Ref<Class<Doc>>
    props?: Record<string, any>
  }[] = [
    {
      searchType: SearchType.Messages,
      component: MessagesBrowser,
      label: chunter.string.Messages
    },
    {
      searchType: SearchType.Files,
      component: FileBrowser,
      label: attachment.string.Files,
      props: {
        requestedSpaceClasses: [chunter.class.Channel, chunter.class.DirectMessage]
      }
    },
    {
      searchType: SearchType.Channels,
      component: ChunterSpacesView,
      filterClass: chunter.class.Channel,
      label: chunter.string.Channels,
      props: {
        _class: chunter.class.Channel,
        icon: chunter.icon.ChannelBrowser,
        label: chunter.string.Channels
      }
    },
    {
      searchType: SearchType.Directs,
      component: ChunterSpacesView,
      filterClass: chunter.class.DirectMessage,
      label: chunter.string.DirectMessages,
      props: {
        _class: chunter.class.DirectMessage,
        icon: contact.class.Contact,
        label: chunter.string.DirectMessages
      }
    }
  ]

  let searchValue: string = ''
  let filterQuery: DocumentQuery<Doc> = {}
</script>

<Header
  icon={chunter.icon.ChannelBrowser}
  intlLabel={chunter.string.ChunterBrowser}
  titleKind={'breadcrumbs'}
  bind:searchValue
  adaptive={'freezeActions'}
  focusSearch
>
  <svelte:fragment slot="search">
    <FilterButton _class={components[searchType].filterClass} />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    <Switcher
      name={'browser_group'}
      kind={'subtle'}
      selected={searchType}
      items={tabs}
      on:select={(result) => {
        if (result !== undefined && result.detail.id !== undefined) searchType = result.detail.id
      }}
    />
  </svelte:fragment>
</Header>
{#if components[searchType].filterClass !== undefined}
  <FilterBar
    _class={components[searchType].filterClass}
    space={undefined}
    query={{ $search: searchValue }}
    hideSaveButtons
    on:change={(e) => {
      filterQuery = e.detail
    }}
  />
{/if}

{#if components[searchType].component}
  <Scroller>
    <svelte:component
      this={components[searchType].component}
      withHeader={false}
      search={userSearch_}
      {filterQuery}
      {...components[searchType].props}
    />
  </Scroller>
{/if}

<style lang="scss">
  .browser {
    flex-grow: 2;
    display: flex;
    justify-content: flex-start;
    flex-direction: column-reverse;
    background-color: var(--theme-panel-color);
  }

  .bar {
    flex-grow: 1;
    display: flex;
    justify-content: flex-start;
    max-height: 4rem;
  }

  .component {
    flex-grow: 2;
    height: 0;
  }
</style>
