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
<!-- The meeting link policy as a property: shows who may start, opens the link settings. -->
<script lang="ts">
  import type { Event } from '@hcengineering/calendar'
  import type { Doc } from '@hcengineering/core'
  import { defaultMeetingAccess, type MeetingAccess, type PermanentMeeting } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'
  import { Button, eventToHTMLElement, showPopup, type ButtonKind, type ButtonSize } from '@hcengineering/ui'
  import love from '../plugin'
  import MeetingLinkPopup from './MeetingLinkPopup.svelte'

  export let value: MeetingAccess | undefined
  export let object: Doc | undefined = undefined
  export let disabled: boolean = false
  export let kind: ButtonKind = 'no-border'
  export let size: ButtonSize = 'small'
  export let justify: 'left' | 'center' = 'left'
  export let width: string | undefined = undefined

  $: start = (value ?? defaultMeetingAccess).start

  function open (e: MouseEvent): void {
    if (object === undefined) return
    const permanent = getClient().getHierarchy().isDerived(object._class, love.class.PermanentMeeting)
    showPopup(
      MeetingLinkPopup,
      permanent ? { meeting: object as PermanentMeeting } : { event: object as Event },
      eventToHTMLElement(e)
    )
  }
</script>

<Button
  label={start === 'link' ? love.string.StartAnyoneWithLink : love.string.StartMembersOnly}
  {kind}
  {size}
  {justify}
  {width}
  disabled={disabled || object === undefined}
  on:click={open}
/>
