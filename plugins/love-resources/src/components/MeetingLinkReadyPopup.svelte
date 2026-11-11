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
  import { createEventDispatcher } from 'svelte'
  import love from '../plugin'

  export let link: string

  const dispatch = createEventDispatcher()
  let copied = false

  async function copy (): Promise<void> {
    await copyTextToClipboard(link)
    copied = true
  }
</script>

<Card
  label={love.string.LinkReady}
  okAction={() => dispatch('close')}
  okLabel={presentation.string.Ok}
  canSave={true}
  on:close={() => dispatch('close')}
>
  <div class="flex-col gap-2 p-4" style="min-width: 32rem">
    <Label label={love.string.CopyMeetingLink} />
    <div class="flex-row-center gap-2">
      <div class="flex-grow">
        <EditBox value={link} disabled />
      </div>
      <Button label={love.string.CopyMeetingLink} kind="primary" on:click={copy} />
    </div>
  </div>
</Card>
