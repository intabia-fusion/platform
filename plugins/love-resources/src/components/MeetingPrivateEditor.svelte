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
  import { AccountRole, getCurrentAccount } from '@hcengineering/core'
  import type { MeetingMinutes } from '@hcengineering/love'
  import type { ButtonKind, ButtonSize } from '@hcengineering/ui'
  import { BooleanEditor } from '@hcengineering/view-resources'
  import { setMeetingPrivate } from '../meetingPrivacy'

  export let object: MeetingMinutes
  export let value: boolean | undefined
  export let readonly = false
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = 'fit-content'

  const me = getCurrentAccount()

  // Organizers and the workspace owner. Stricter than checkSpacePermissions, which lets anyone close a meeting without owners.
  $: canChange = me.role === AccountRole.Owner || (object.owners ?? []).includes(me.uuid)

  let reset = 0

  async function change (val: boolean): Promise<void> {
    if (val === object.private) return
    await setMeetingPrivate(object, val)
    // Remount from object.private: cancel and server refusal (swallowed by the client middleware) leave it unchanged.
    reset++
  }
</script>

{#key reset}
  <BooleanEditor
    value={value ?? false}
    withoutUndefined
    disabled={readonly || !canChange}
    onChange={change}
    {kind}
    {size}
    {justify}
    {width}
  />
{/key}
