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
  import type { AccountUuid, Class, Doc, DocPreview, Ref } from '@hcengineering/core'
  import { getDocTitle, getPreviewTitle, openDoc, previewMembers } from '@hcengineering/view-resources'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import type { Channel } from '@hcengineering/chunter'
  import type { ActivityMessagesFilter, WithReferences } from '@hcengineering/activity'
  import type { Person } from '@hcengineering/contact'
  import contact from '@hcengineering/contact'
  import view from '@hcengineering/view'
  import { languageStore } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'

  import Header from './Header.svelte'
  import chunter from '../plugin'
  import { getObjectIcon, getChannelName, getDmPersons, isDirectMessage } from '../utils'
  import PinnedMessages from './PinnedMessages.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: WithReferences<Doc> | undefined
  export let preview: DocPreview | undefined = undefined
  export let allowClose: boolean = false
  export let canOpen: boolean = false
  export let withAside: boolean = false
  export let withSearch: boolean = true
  export let withPresence: boolean = true
  export let isAsideShown: boolean = false
  export let filters: Ref<ActivityMessagesFilter>[] = []
  export let canOpenInSidebar: boolean = false
  export let closeOnEscape: boolean = true
  export let hideTitle: boolean = false
  export let withPinned: boolean = true

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let title: string | undefined = undefined
  let description: string | undefined = undefined
  let realWidth: number

  $: void updateDescription(_id, _class, object)

  // Only the latest call sets its field: a slow answer for the chat left meanwhile is dropped, not waited for
  let titleAsk = 0
  let descriptionAsk = 0
  let directPersonAsk = 0

  // Before the document comes its preview names it without a request
  async function updateTitle (
    _id: Ref<Doc>,
    _class: Ref<Class<Doc>>,
    object: Doc | undefined,
    preview: DocPreview | undefined,
    lang: string
  ): Promise<void> {
    const ask = ++titleAsk
    let res: string | undefined
    if (object != null) res = await getChannelName(_id, _class, object, lang)
    else if (preview?.objectId === _id) res = await getPreviewTitle(client, preview, lang)
    if (ask === titleAsk) title = res
  }
  $: void updateTitle(_id, _class, object, preview, $languageStore)

  async function updateDescription (_id: Ref<Doc>, _class: Ref<Class<Doc>>, object?: Doc): Promise<void> {
    const ask = ++descriptionAsk
    let res: string | undefined
    if (hierarchy.isDerived(_class, chunter.class.DirectMessage) || hierarchy.isDerived(_class, contact.class.Person)) {
      res = undefined
    } else if (hierarchy.isDerived(_class, chunter.class.Channel)) {
      res = (object as Channel)?.topic
    } else if (object != null && hierarchy.classHierarchyMixin(_class, view.mixin.ObjectIdentifier) != null) {
      res = await getDocTitle(client, _id, _class, object)
    }
    if (ask === descriptionAsk) description = res
  }

  // A direct with no messages yet has no author to click, so the header is the only way to the person card.
  let directPerson: Person | undefined = undefined
  let directPersonOf: Ref<Doc> | undefined = undefined

  async function updateDirectPerson (_id: Ref<Doc>, members: AccountUuid[] | undefined): Promise<void> {
    const ask = ++directPersonAsk
    // The previous direct's person must not stay clickable while the new one loads
    if (directPersonOf !== _id) directPerson = undefined
    directPersonOf = _id
    if (members == null) {
      directPerson = undefined
      return
    }
    const res = await getDmPersons(client, members)
    if (ask === directPersonAsk) directPerson = members.length === 2 && res.length === 1 ? res[0] : undefined
  }

  // The direct's own members; the preview of the click carries them before the direct comes
  function getDirectMembers (
    _id: Ref<Doc>,
    object: Doc | undefined,
    preview: DocPreview | undefined
  ): AccountUuid[] | undefined {
    if (object != null) return isDirectMessage(object) ? object.members : undefined
    if (preview?.objectId !== _id || !hierarchy.isDerived(preview.objectClass, chunter.class.DirectMessage)) {
      return undefined
    }
    return previewMembers(preview)
  }

  $: void updateDirectPerson(_id, getDirectMembers(_id, object, preview))

  $: isPerson =
    hierarchy.isDerived(_class, chunter.class.DirectMessage) || hierarchy.isDerived(_class, contact.class.Person)
</script>

<Header
  bind:filters
  {object}
  icon={getObjectIcon(_class)}
  iconProps={{ value: object, showStatus: true, editable: true }}
  label={title}
  intlLabel={chunter.string.Channel}
  {description}
  titleKind={isPerson ? 'default' : 'breadcrumbs'}
  withFilters={false}
  {allowClose}
  {canOpen}
  {withAside}
  {isAsideShown}
  {withSearch}
  {withPresence}
  {hideTitle}
  {canOpenInSidebar}
  {closeOnEscape}
  bind:realWidth
  on:aside-toggled
  on:close
  on:search
>
  <svelte:fragment slot="search">
    <slot name="search" />
  </svelte:fragment>
  <svelte:fragment slot="actions">
    {#if object !== undefined && withPinned}
      <PinnedMessages
        {_id}
        {_class}
        space={object.space}
        withRefs={(object.references ?? 0) > 0}
        iconOnly={realWidth < 380}
        on:select
      />
    {/if}
    {#if directPerson !== undefined}
      <ComponentExtensions
        extension={chunter.extensions.DirectHeaderExtension}
        props={{ employee: directPerson, type: 'type-button-icon', size: 'small', withBackground: false }}
      />
      <IconButton
        icon={contact.icon.User}
        size="small"
        iconSize="small"
        tooltip={{ label: contact.string.ViewProfile }}
        data-id="btnDirectViewProfile"
        on:click={() => directPerson && openDoc(hierarchy, directPerson)}
      />
    {/if}
    <slot name="actions" />
  </svelte:fragment>
</Header>
