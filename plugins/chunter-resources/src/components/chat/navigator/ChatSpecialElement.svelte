<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { createEventDispatcher } from 'svelte'
  import { SpecialNavModel } from '@hcengineering/workbench'
  import { SavedAttachments } from '@hcengineering/attachment'
  import { SavedMessage } from '@hcengineering/activity'
  import { savedMessagesStore } from '@hcengineering/activity-resources'
  import { savedAttachmentsStore } from '@hcengineering/attachment-resources'

  import NavItem from './NavItem.svelte'

  export let special: SpecialNavModel
  export let currentSpecial: SpecialNavModel | undefined = undefined
  export let type: 'type-link' | 'type-tag' | 'type-anchor-link' | 'type-object' = 'type-link'

  const dispatch = createEventDispatcher()

  let elementsCount = 0
  $: elementsCount = getElementsCount(special, $savedMessagesStore, $savedAttachmentsStore)

  function getElementsCount (
    special: SpecialNavModel,
    savedMessages: SavedMessage[],
    savedAttachments: SavedAttachments[]
  ): number {
    if (special.id === 'saved') {
      return savedMessages.length + savedAttachments.length
    }

    return 0
  }
</script>

<NavItem
  _id={special.id}
  icon={special.icon}
  intlTitle={special.label}
  withIconBackground={false}
  {elementsCount}
  isSelected={special.id === currentSpecial?.id}
  {type}
  on:click={() => dispatch('select', null)}
/>
