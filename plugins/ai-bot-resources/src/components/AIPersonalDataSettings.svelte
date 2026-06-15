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
  import core, { getCurrentAccount } from '@hcengineering/core'
  import aiBot, { type AIPersonalData } from '@hcengineering/ai-bot'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Breadcrumb, Button, Header, Label, TextArea } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  const client = getClient()
  const me = getCurrentAccount().uuid

  let data: AIPersonalData | undefined = undefined
  let assistantMemory = ''
  let userMemory = ''
  let sharedContext = ''

  const query = createQuery()
  query.query(aiBot.class.AIPersonalData, { attachedTo: me }, (res) => {
    data = res[0]
    assistantMemory = data?.assistantMemory ?? ''
    userMemory = data?.userMemory ?? ''
    sharedContext = data?.sharedContext ?? ''
  })

  async function save (
    patch: Partial<Pick<AIPersonalData, 'assistantMemory' | 'userMemory' | 'sharedContext'>>
  ): Promise<void> {
    if (data !== undefined) {
      await client.update(data, patch)
    } else {
      await client.createDoc(aiBot.class.AIPersonalData, core.space.Workspace, {
        attachedTo: me,
        assistantMemory: '',
        userMemory: '',
        sharedContext: '',
        ...patch
      })
    }
  }

  async function clearAll (): Promise<void> {
    assistantMemory = ''
    userMemory = ''
    sharedContext = ''
    await save({ assistantMemory: '', userMemory: '', sharedContext: '' })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={view.icon.AiStar} label={aiBot.string.AISettings} size={'large'} isCurrent />
  </Header>
  <div class="flex-row-stretch flex-grow p-10">
    <div class="flex-grow flex-col flex-gap-6" style:max-width={'48rem'}>
      <div class="flex-col flex-gap-2">
        <Label label={aiBot.string.AssistantMemory} />
        <span class="content-dark-color text-sm"><Label label={aiBot.string.AssistantMemoryHint} /></span>
        <TextArea bind:value={assistantMemory} on:blur={() => save({ assistantMemory })} />
      </div>

      <div class="flex-col flex-gap-2">
        <Label label={aiBot.string.UserMemory} />
        <span class="content-dark-color text-sm"><Label label={aiBot.string.UserMemoryHint} /></span>
        <TextArea bind:value={userMemory} on:blur={() => save({ userMemory })} />
      </div>

      <div class="flex-col flex-gap-2">
        <Label label={aiBot.string.SharedContext} />
        <span class="content-dark-color text-sm"><Label label={aiBot.string.SharedContextHint} /></span>
        <TextArea bind:value={sharedContext} on:blur={() => save({ sharedContext })} />
      </div>

      <div class="flex-row-center">
        <Button label={aiBot.string.ClearAll} kind={'dangerous'} on:click={clearAll} />
      </div>
    </div>
  </div>
</div>
