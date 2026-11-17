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
  import type { AccountUuid } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import type { Person } from '@hcengineering/contact'
  import contact from '@hcengineering/contact'
  import type { IconSize } from '@hcengineering/ui'

  import ObjectPresenter from './ObjectPresenter.svelte'

  export let value: AccountUuid | undefined
  export let shouldShowName = true
  export let shouldShowAvatar = true
  export let noUnderline = false
  export let shrink: boolean = false
  export let avatarSize: IconSize = 'x-small'
  export let withPadding: boolean = true

  const query = createQuery()
  let person: Person | undefined
  $: if (value !== undefined && typeof value === 'string') {
    person = undefined
    query.query(contact.class.Person, { personUuid: value }, (persons) => {
      person = persons[0]
    })
  } else {
    query.unsubscribe()
    person = undefined
  }
</script>

{#if person}
  <div class={withPadding ? 'pl-3' : ''}>
    <ObjectPresenter
      value={person}
      {shouldShowName}
      {shouldShowAvatar}
      {noUnderline}
      shrink={shrink ? 1 : 0}
      props={{ avatarSize }}
    />
  </div>
{/if}
