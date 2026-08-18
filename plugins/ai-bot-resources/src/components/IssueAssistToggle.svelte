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
  import { deviceOptionsStore as deviceInfo, ModernButton } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import aiBot from '../plugin'
  import { issueAssistOpened } from '../stores'

  // Toggle lives in the dialog header, the panel itself renders in the card's aside slot; the
  // store is what ties the two places together.
</script>

{#if !$deviceInfo.isMobile}
  <ModernButton
    icon={view.icon.AiStar}
    iconSize={'small'}
    size={'small'}
    kind={$issueAssistOpened ? 'primary' : 'tertiary'}
    pressed={$issueAssistOpened}
    tooltip={{ label: aiBot.string.AssistIssue }}
    on:click={() => {
      issueAssistOpened.update((v) => !v)
    }}
  />
{/if}
