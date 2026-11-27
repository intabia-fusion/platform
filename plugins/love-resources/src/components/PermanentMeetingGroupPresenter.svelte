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
<!--
  The `group` column, the category headers of the grouped list and a mention of a group: the same
  component is both an AttributePresenter (a ref) and an ObjectPresenter (a document).
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import love, { type MeetingGroup } from '@hcengineering/love'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import ui, { eventToHTMLElement, Menu, showPopup, type Action } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'

  import { deleteMeetingGroup } from '../groups'
  import MeetingGroupPopup from './MeetingGroupPopup.svelte'

  // A ref from the attribute presenter, a document from the object presenter - both end up here.
  export let value: Ref<MeetingGroup> | MeetingGroup | undefined = undefined
  // The list header passes the already fetched document beside the ref it groups by.
  export let object: MeetingGroup | undefined = undefined

  let name: string | undefined = undefined
  // The document, when the presenter got one: the header of a section, not a cell of a column.
  let doc: MeetingGroup | undefined = undefined

  const query = createQuery()
  $: if (object !== undefined) {
    name = object.name
    doc = object
    query.unsubscribe()
  } else if (value === undefined) {
    name = undefined
    doc = undefined
    query.unsubscribe()
  } else if (typeof value === 'object') {
    // Already a document: no reason to look it up again.
    name = value.name
    doc = value
    query.unsubscribe()
  } else {
    doc = undefined
    void query.query(love.class.MeetingGroup, { _id: value }, (res) => {
      name = res[0]?.name
    })
  }

  function rename (): void {
    if (doc === undefined) return
    showPopup(MeetingGroupPopup, { group: doc }, 'center')
  }

  async function remove (): Promise<void> {
    if (doc === undefined) return
    const group = doc
    const confirmed = await new Promise<boolean>((resolve) => {
      showPopup(
        MessageBox,
        {
          label: love.string.DeleteGroup,
          message: love.string.DeleteGroupMessage,
          okLabel: view.string.Delete
        },
        undefined,
        (result?: boolean) => {
          resolve(result === true)
        }
      )
    })
    if (!confirmed) return
    await deleteMeetingGroup(getClient(), group)
  }

  function showMenu (event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const actions: Action[] = [
      {
        label: view.string.Rename,
        action: async () => {
          rename()
        }
      },
      {
        label: love.string.DeleteGroup,
        action: async () => {
          await remove()
        }
      }
    ]
    showPopup(Menu, { actions }, eventToHTMLElement(event))
  }
</script>

{#if name !== undefined}
  <span class="group-presenter">
    <span class="overflow-label">{name}</span>
    {#if doc !== undefined}
      <span class="group-presenter__menu" data-id="meeting-group-menu">
        <IconButton icon={ui.icon.DotsVertical} size="small" kind="ghost" on:click={showMenu} />
      </span>
    {/if}
  </span>
{/if}

<style lang="scss">
  .group-presenter {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    max-width: 100%;
  }

  // Hidden until the header is hovered or the menu has focus: a section header stays quiet.
  .group-presenter__menu {
    display: inline-flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.1s ease-in-out;
  }

  .group-presenter:hover .group-presenter__menu,
  .group-presenter__menu:focus-within {
    opacity: 1;
  }
</style>
