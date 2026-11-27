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
  import calendar, { type Event } from '@hcengineering/calendar'
  import love, { type PermanentMeeting } from '@hcengineering/love'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { copyTextToClipboard, createQuery } from '@hcengineering/presentation'
  import ui from '@hcengineering/ui'
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

  // The meeting keeps the reference to its event, so the row knows whether it has anything in the
  // calendar. A live query over the event's link mixin did not refresh the icon; the meeting document
  // is a plain live query, and the writer updates it when the series appears or goes away.
  $: icon = value.event !== undefined ? love.icon.MeetingMinutes : ui.icon.EyeSlash

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
              <Icon {icon} size="medium" />
            </div>
          {/if}
          <div class="label nowrap" class:no-underline={noUnderline || disabled} class:fs-bold={accent}>
            {value.name}
          </div>
          <!-- Only a meeting that repeats is a standing one: a one-off lives in the same class now, and
               the mark would call it permanent. -->
          {#if value.repeatEvery !== undefined}
            <span
              class="icon permanent-mark"
              use:tooltip={{ label: love.string.PermanentMeeting }}
              data-id="permanent-meeting-mark"
            >
              <Icon icon={calendar.icon.Repeat} size="smaller" />
            </span>
          {/if}
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
          <Icon {icon} size="medium" />
        </div>
      {/if}
      <span class="overflow-label">{value.name}</span>
      {#if value.repeatEvery !== undefined}
        <span
          class="icon permanent-mark"
          use:tooltip={{ label: love.string.PermanentMeeting }}
          data-id="permanent-meeting-mark"
        >
          <Icon icon={calendar.icon.Repeat} size="smaller" />
        </span>
      {/if}
    </span>
  {/if}
{/if}

<style lang="scss">
  // Sits in the row like the kind icon beside it: same muted colour, same hover, no accent of its
  // own - it only says "this one repeats".
  .permanent-mark {
    display: flex;
    align-items: center;
    padding: 0 0.125rem;
    flex-shrink: 0;
  }
</style>
