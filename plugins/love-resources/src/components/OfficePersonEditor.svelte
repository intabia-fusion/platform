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
  Who sits in an office. An attribute editor, so the seat is changed in the properties of the room
  card, next to the floor and the other attributes, and not by a field of its own in the centre.
-->
<script lang="ts">
  import contact, { type Employee } from '@hcengineering/contact'
  import { AssigneeBox } from '@hcengineering/contact-resources'
  import { AccountRole, getCurrentAccount, type Ref } from '@hcengineering/core'
  import type { Office } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import type { ButtonKind, ButtonSize } from '@hcengineering/ui'

  export let object: Office
  export let value: Ref<Employee> | null | undefined = null
  export let readonly = false
  export let kind: ButtonKind = 'regular'
  export let size: ButtonSize = 'medium'
  export let justify: 'left' | 'center' = 'left'
  export let width: string | undefined = '100%'

  const client = getClient()
  const me = getCurrentAccount()
  // Arranging the office is what adds or hands over a seat.
  $: canChange = me.role === AccountRole.Owner || me.role === AccountRole.Maintainer

  async function change (person: Ref<Employee> | null): Promise<void> {
    if (person === (object.person ?? null)) return
    await client.update(object, { person })
  }
</script>

<AssigneeBox
  _class={contact.mixin.Employee}
  label={contact.string.Employee}
  placeholder={contact.string.Employee}
  avatarSize="small"
  {kind}
  {size}
  {justify}
  {width}
  showNavigate={false}
  value={value ?? null}
  allowDeselect={true}
  readonly={readonly || !canChange}
  on:change={(ev) => {
    void change(ev.detail)
  }}
/>
