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
  import type { WithLookup } from '@hcengineering/core'
  import love, { type PermanentMeeting } from '@hcengineering/love'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { copyTextToClipboard } from '@hcengineering/presentation'
  import { getCurrentAccount } from '@hcengineering/core'
  import { Icon, tooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import type { ObjectPresenterType } from '@hcengineering/view'
  import { DocNavLink, ObjectMention } from '@hcengineering/view-resources'
  import { getEventMeetingLink, notifyCopied } from '../utils'
  import { canEditMeeting } from '../permissions'

  export let value: WithLookup<PermanentMeeting>
  export let inline: boolean = false
  export let disabled: boolean = false
  export let accent: boolean = false
  export let noUnderline: boolean = false
  export let shouldShowAvatar = true
  export let type: ObjectPresenterType = 'link'

  let copying = false

  // The link is for the people who are in the meeting: it is a door into the room, not a public
  // address, so a passer-by sees the name only.
  $: canCopyLink = canEditMeeting(value, getCurrentAccount())

  // The row is a link itself, so the copy control has to swallow the click, or it opens the panel.
  async function copyLink (e: MouseEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    if (copying || disabled) return
    copying = true
    try {
      const link = await getEventMeetingLink(value._id, 'meeting')
      if (link === '') return
      await copyTextToClipboard(link)
      await notifyCopied(love.string.LinkCopied)
    } finally {
      copying = false
    }
  }
</script>

{#if value}
  {#if inline}
    <ObjectMention object={value} {disabled} />
  {:else if type === 'link'}
    <DocNavLink object={value} {disabled} {accent} {noUnderline}>
      <div class="flex-presenter" use:tooltip={{ label: getEmbeddedLabel(value.name) }}>
        {#if shouldShowAvatar}
          <div class="icon">
            <Icon icon={love.icon.MeetingMinutes} size="medium" />
          </div>
        {/if}
        <div class="label nowrap" class:no-underline={noUnderline || disabled} class:fs-bold={accent}>
          {value.name}
        </div>
        {#if canCopyLink}
          <IconButton
            icon={view.icon.CopyLink}
            size="small"
            kind="ghost"
            loading={copying}
            tooltip={{ label: love.string.CopyMeetingLink }}
            data-id="permanent-meeting-copy-link"
            on:click={copyLink}
          />
        {/if}
      </div>
    </DocNavLink>
  {:else}
    <span class="flex-presenter" use:tooltip={{ label: getEmbeddedLabel(value.name) }}>
      {#if shouldShowAvatar}
        <div class="icon">
          <Icon icon={love.icon.MeetingMinutes} size="medium" />
        </div>
      {/if}
      <span class="overflow-label">{value.name}</span>
    </span>
  {/if}
{/if}
