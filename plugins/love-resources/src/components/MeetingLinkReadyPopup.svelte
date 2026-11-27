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
  Shown right after a permanent meeting is created: the guest link is the thing the author needs to
  share, and digging it out of the settings window afterwards is the step this screen removes.
-->
<script lang="ts">
  import presentation, { Card, copyTextToClipboard } from '@hcengineering/presentation'
  import { Button, EditBox, Label } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'
  import { notifyCopied, withPassword } from '../utils'

  export let link: string
  // The password the meeting was just created with: the server stores a hash and never returns the
  // plaintext, so this screen is the one place that can offer both forms of the link.
  export let password: string | undefined = undefined

  const dispatch = createEventDispatcher()
  let copied = false

  async function copy (withPasswordInLink: boolean = false): Promise<void> {
    const text = withPasswordInLink && password !== undefined ? withPassword(link, password) : link
    await copyTextToClipboard(text)
    copied = true
    await notifyCopied(love.string.LinkCopied)
  }
</script>

<Card
  label={love.string.LinkReady}
  okAction={() => {
    dispatch('close')
  }}
  okLabel={presentation.string.Ok}
  canSave={true}
  on:close={() => {
    dispatch('close')
  }}
>
  <div class="flex-col gap-2 p-4" style="min-width: 32rem">
    <Label label={love.string.CopyMeetingLink} />
    <EditBox value={link} disabled />
    <div class="flex-row-center flex-wrap flex-gap-2">
      <Button label={copied ? view.string.Copied : love.string.CopyMeetingLink} kind="primary" on:click={copy} />
      {#if password !== undefined}
        <Button
          label={love.string.CopyLinkWithPassword}
          on:click={() => {
            void copy(true)
          }}
        />
      {/if}
    </div>
  </div>
</Card>
