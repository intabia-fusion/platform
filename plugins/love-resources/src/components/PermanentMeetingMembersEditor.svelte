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
  import { AccountRole, getCurrentAccount, type AccountUuid, type Ref } from '@hcengineering/core'
  import type { PermanentMeeting } from '@hcengineering/love'
  import type { IntlString } from '@hcengineering/platform'
  import type { ButtonKind, ButtonSize } from '@hcengineering/ui'

  export let object: PermanentMeeting | undefined = undefined
  export let label: IntlString
  export let value: AccountUuid[] | undefined
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

  // An owner outside `members` cannot open the meeting's session, so the panel does not offer to
  // remove them: the server restores an owner anyway (OnPermanentMeetingUpdate), this keeps the
  // UI from showing an action that silently does nothing.
  $: owners = object?.owners ?? []
  // A table cell renders this editor from `value` alone, with no document to protect.
  $: mayEdit = object === undefined || me.role === AccountRole.Owner || owners.includes(me.uuid)
  $: effectiveReadonly = readonly || !mayEdit

  async function handleChange (selected: AccountUuid[]): Promise<void> {
    if (!mayEdit) return
    await onChange?.(object === undefined ? selected : [...new Set([...owners, ...selected])])
  }
</script>

<AccountArrayEditor
  {label}
  {value}
  onChange={handleChange}
  readonly={effectiveReadonly}
  {kind}
  {size}
  {width}
  {includeItems}
  {excludeItems}
  {emptyLabel}
  {allowGuests}
  {attributeKey}
  protectedAccounts={owners}
/>
