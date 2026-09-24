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
  import { Class, Doc, Ref, reduceCalls } from '@hcengineering/core'
  import { getDocTitle, openDoc } from '@hcengineering/view-resources'
  import { ComponentExtensions, getClient } from '@hcengineering/presentation'
  import { Channel, DirectMessage } from '@hcengineering/chunter'
  import { ActivityMessagesFilter, WithReferences } from '@hcengineering/activity'
  import contact, { Person } from '@hcengineering/contact'
  import view from '@hcengineering/view'
  import { ButtonIcon, languageStore } from '@hcengineering/ui'

  import Header from './Header.svelte'
  import chunter from '../plugin'
  import { getObjectIcon, getChannelName, getDmPersons } from '../utils'
  import PinnedMessages from './PinnedMessages.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: WithReferences<Doc> | undefined
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

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let title: string | undefined = undefined
  let description: string | undefined = undefined
  let realWidth: number

  $: void updateDescription(_id, _class, object)

  $: void getChannelName(_id, _class, object, $languageStore).then((res) => {
    title = res
  })

  async function updateDescription (_id: Ref<Doc>, _class: Ref<Class<Doc>>, object?: Doc): Promise<void> {
    if (hierarchy.isDerived(_class, chunter.class.DirectMessage) || hierarchy.isDerived(_class, contact.class.Person)) {
      description = undefined
    } else if (hierarchy.isDerived(_class, chunter.class.Channel)) {
      description = (object as Channel)?.topic
    } else {
      const hasId = hierarchy.classHierarchyMixin(_class, view.mixin.ObjectIdentifier) !== undefined
      description = hasId ? await getDocTitle(client, _id, _class, object) : undefined
    }
  }

  // A direct with no messages yet has no author to click, so the header is the only way to the person card.
  let directPerson: Person | undefined = undefined
  // Serialized, so a slower answer for the previous direct cannot land on the one opened since.
  const updateDirectPerson = reduceCalls(async (object: Doc | undefined, _class: Ref<Class<Doc>>): Promise<void> => {
    if (object === undefined || !hierarchy.isDerived(_class, chunter.class.DirectMessage)) {
      directPerson = undefined
      return
    }
    const dm = object as DirectMessage
    const res = await getDmPersons(client, dm)
    directPerson = dm.members.length === 2 && res.length === 1 ? res[0] : undefined
  })
  $: void updateDirectPerson(object, _class)

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
    {#if directPerson !== undefined}
      <ComponentExtensions
        extension={chunter.extensions.DirectHeaderExtension}
        props={{ employee: directPerson, type: 'type-button-icon', size: 'small', withBackground: false }}
      />
      <ButtonIcon
        icon={contact.icon.User}
        size="small"
        iconSize="small"
        tooltip={{ label: contact.string.ViewProfile }}
        dataId="btnDirectViewProfile"
        on:click={() => directPerson && openDoc(hierarchy, directPerson)}
      />
    {/if}
    <slot name="actions" />
  </svelte:fragment>
  {#if object}
    <PinnedMessages
      {_id}
      {_class}
      space={object.space}
      withRefs={(object.references ?? 0) > 0}
      iconOnly={realWidth < 380}
      on:select
    />
  {/if}
</Header>
