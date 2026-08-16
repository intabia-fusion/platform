<!--
// Copyright © 2026 Intabia Fusion
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
  import { type Doc } from '@hcengineering/core'
  import aiBot, { type AIContextMessage } from '@hcengineering/ai-bot'
  import { getResource } from '@hcengineering/platform'
  import { Button, showPopup } from '@hcengineering/ui'
  import { MessageBox } from '@hcengineering/presentation'
  import chunter from '@hcengineering/chunter'
  import view from '@hcengineering/view'

  import plugin from '../plugin'
  import { resetObjectConversation } from '../conversation'

  // Thread header passes the root message as `value`. Only render for AI context roots.
  export let value: Doc

  $: isAIContext = value._class === aiBot.class.AIContextMessage
  $: root = value as AIContextMessage

  function newContext (): void {
    showPopup(MessageBox, {
      label: plugin.string.NewContext,
      message: plugin.string.NewContextConfirm,
      action: async () => {
        const started = await resetObjectConversation(root, '')
        if (started === undefined) return
        const openThread = await getResource(chunter.function.OpenThreadInSidebar)
        await openThread(started.messageId, undefined, started.direct)
      }
    })
  }
</script>

{#if isAIContext}
  <Button
    icon={view.icon.Add}
    kind={'ghost'}
    size={'small'}
    showTooltip={{ label: plugin.string.NewContextHint }}
    on:click={newContext}
  />
{/if}
