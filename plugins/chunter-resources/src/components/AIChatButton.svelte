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
  import { getMetadata } from '@hcengineering/platform'
  import aiBot from '@hcengineering/ai-bot'
  import view from '@hcengineering/view'
  import { AppItem } from '@hcengineering/workbench-resources'
  import chunter from '@hcengineering/chunter'

  import { openAIChat } from '../utils'

  // No ai-bot endpoint configured -> no assistant, no button.
  $: enabled = (getMetadata(aiBot.metadata.EndpointURL) ?? '') !== ''
</script>

{#if enabled}
  <AppItem
    icon={view.icon.AiStar}
    label={chunter.string.TalkToYulia}
    size="small"
    dataId="ai-chat-button"
    on:click={() => {
      void openAIChat()
    }}
  />
{/if}
