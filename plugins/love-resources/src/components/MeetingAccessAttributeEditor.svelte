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
  import AccountArrayEditor from '@hcengineering/contact-resources/src/components/AccountArrayEditor.svelte'
  import { type AccountUuid, type Ref, getCurrentAccount, AccountRole } from '@hcengineering/core'
  import type { MeetingMinutes } from '@hcengineering/love'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import type { ButtonKind, ButtonSize } from '@hcengineering/ui'
  import { loveClient } from '../utils'

  export let object: MeetingMinutes
  export let label: IntlString
  export let value: AccountUuid | AccountUuid[] | undefined
  export let onChange: ((refs: AccountUuid[]) => void | Promise<void>) | undefined
  export let readonly = false
  export let kind: ButtonKind = 'link'
  export let size: ButtonSize = 'large'
  export let width: string | undefined = undefined
  export let includeItems: Ref<any>[] = []
  export let excludeItems: Ref<any>[] = []
  export let emptyLabel: IntlString | undefined = undefined
  export let allowGuests: boolean = false
  export let attributeKey: string | undefined = undefined

  const me = getCurrentAccount()

  $: effectiveOwners = object.owners ?? []
  $: effectiveMembers = object.members ?? []
  $: isOwner = me.role === AccountRole.Owner || effectiveOwners.includes(me.uuid)
  $: effectiveReadonly = readonly || !isOwner

  let protectedAccounts: AccountUuid[] = []
  $: {
    if (attributeKey === 'members') {
      const owners = object.owners ?? []
      const current = me.uuid !== undefined ? [me.uuid] : []
      protectedAccounts = Array.from(new Set([...owners, ...current]))
    } else {
      // owners: статическая защита не нужна — «последнего» защищает сам popup
      protectedAccounts = []
    }
  }

  $: protectLastSelected = attributeKey === 'owners'

  async function handleChange (selected: AccountUuid[]): Promise<void> {
    if (!isOwner) return

    const previousList = attributeKey === 'owners' ? effectiveOwners : effectiveMembers
    const removed = previousList.filter((acc) => !selected.includes(acc))

    if (attributeKey === 'owners' && selected.length === 0) {
      console.warn('[MeetingAccessAttributeEditor] Cannot remove all owners - at least one must remain')
      return
    }

    if (attributeKey === 'owners') {
      // An owner outside members gets 403 from /getToken of a private meeting.
      await getClient().update(object, { owners: selected, members: [...new Set([...effectiveMembers, ...selected])] })
      return
    }

    // The server kicks only someone already out of members; a public meeting is not gated by members.
    await onChange?.(selected)
    if (removed.length > 0 && attributeKey === 'members' && object.private) {
      removed.forEach((targetAccount) => {
        void loveClient.kickParticipant(object._id, targetAccount)
      })
    }
  }
</script>

<AccountArrayEditor
  {label}
  {value}
  readonly={effectiveReadonly}
  onChange={handleChange}
  {kind}
  {size}
  {width}
  {includeItems}
  {excludeItems}
  {emptyLabel}
  {allowGuests}
  {attributeKey}
  {protectedAccounts}
  {protectLastSelected}
/>
