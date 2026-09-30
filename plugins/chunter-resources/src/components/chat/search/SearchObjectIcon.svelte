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
  import type { Employee } from '@hcengineering/contact'
  import { Avatar, employeeByIdStore } from '@hcengineering/contact-resources'
  import type { Doc, Ref } from '@hcengineering/core'
  import love, { type Office } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import type { IconSize } from '@hcengineering/ui'
  import { ObjectIcon } from '@hcengineering/view-resources'

  import { isAvatarObject } from '../../../search/classes'

  export let doc: Doc
  export let avatarSize: IconSize
  export let size: IconSize = 'small'

  const hierarchy = getClient().getHierarchy()

  $: owner = hierarchy.isDerived(doc._class, love.class.Office)
    ? $employeeByIdStore.get((doc as Office).person as Ref<Employee>)
    : undefined

  $: isAvatar = isAvatarObject(doc._class, doc)
</script>

{#if owner !== undefined}
  <Avatar person={owner} name={owner.name} size={avatarSize} />
{:else}
  <ObjectIcon value={doc} size={isAvatar ? avatarSize : size} />
{/if}
