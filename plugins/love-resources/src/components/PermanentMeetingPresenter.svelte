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
  import presentation, { copyTextToClipboard } from '@hcengineering/presentation'
  import { Icon, tooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import type { ObjectPresenterType } from '@hcengineering/view'
  import { DocNavLink, ObjectMention } from '@hcengineering/view-resources'
  import lovePlugin from '../plugin'
  import { getEventMeetingLink, notifyCopied } from '../utils'

  export let value: WithLookup<PermanentMeeting>
  export let inline: boolean = false
  export let disabled: boolean = false
  export let accent: boolean = false
  export let noUnderline: boolean = false
  export let shouldShowAvatar = true
  export let type: ObjectPresenterType = 'link'

  // A link is the only thing a permanent meeting shares: keep it one click away in every row.
  async function copyLink (): Promise<void> {
    const link = await getEventMeetingLink(value._id, 'meeting')
    if (link === '') return
    await copyTextToClipboard(link)
    await notifyCopied(lovePlugin.string.LinkCopied)
  }
</script>

{#if value}
  {#if inline}
    <ObjectMention object={value} {disabled} />
  {:else if type === 'link'}
    <div class="flex-presenter">
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
        </div>
      </DocNavLink>
      {#if !disabled}
        <IconButton
          icon={view.icon.CopyLink}
          size="small"
          kind="ghost"
          tooltip={{ label: presentation.string.CopyLink }}
          data-id="permanent-meeting-copy-link"
          on:click={copyLink}
        />
      {/if}
    </div>
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
