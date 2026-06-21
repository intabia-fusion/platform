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
  import core from '@hcengineering/core'
  import aiBot, { type AILevel, type AILevelInfo, type AISpaceSettings } from '@hcengineering/ai-bot'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Breadcrumb, DropdownLabels, DropdownTextItem, EditBox, Header, Label, Toggle } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { onMount } from 'svelte'

  import { getAILevels } from '../requests'

  const client = getClient()

  let doc: AISpaceSettings | undefined = undefined
  let level: AILevel = ''
  let language: string = ''
  let fallbackToSimpler: boolean = false
  let levelInfos: AILevelInfo[] = []
  let levelItems: DropdownTextItem[] = []

  const query = createQuery()
  query.query(aiBot.class.AISpaceSettings, { attachedTo: { $exists: false } }, (res) => {
    doc = res[0]
    level = doc?.level ?? level
    language = doc?.language ?? ''
    fallbackToSimpler = doc?.fallbackToSimpler ?? false
  })

  onMount(async () => {
    levelInfos = await getAILevels()
    levelInfos.sort((a, b) => a.order - b.order)
    levelItems = levelInfos.map((l) => ({ id: l.level, label: l.label }))
    if (level === '' && levelInfos.length > 0) {
      level = levelInfos[0].level
    }
  })

  async function save (
    patch: Partial<Pick<AISpaceSettings, 'level' | 'language' | 'fallbackToSimpler'>>
  ): Promise<void> {
    if (doc !== undefined) {
      await client.update(doc, patch)
    } else {
      await client.createDoc(aiBot.class.AISpaceSettings, core.space.Workspace, {
        level: level !== '' ? level : (levelInfos[0]?.level ?? 'low'),
        ...patch
      })
    }
  }

  function onLevelSelected (e: CustomEvent<string>): void {
    level = e.detail
    void save({ level })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={view.icon.AiStar} label={aiBot.string.AISpaceSettings} size={'large'} isCurrent />
  </Header>
  <div class="flex-row-stretch flex-grow p-10">
    <div class="flex-grow flex-col flex-gap-6" style:max-width={'48rem'}>
      <div class="flex-col flex-gap-2">
        <Label label={aiBot.string.AILevel} />
        <span class="content-dark-color text-sm"><Label label={aiBot.string.AILevelHint} /></span>
        {#if levelItems.length > 0}
          <DropdownLabels
            items={levelItems}
            selected={level}
            size={'large'}
            kind={'link-bordered'}
            enableSearch={false}
            autoSelect={false}
            on:selected={onLevelSelected}
          />
        {/if}
      </div>

      <div class="flex-col flex-gap-2">
        <Label label={aiBot.string.Language} />
        <span class="content-dark-color text-sm"><Label label={aiBot.string.LanguageHint} /></span>
        <EditBox
          bind:value={language}
          placeholder={aiBot.string.LanguageHint}
          kind={'default'}
          on:blur={() => save({ language: language !== '' ? language : undefined })}
        />
      </div>

      <div class="flex-row-center flex-gap-2">
        <Toggle
          on={fallbackToSimpler}
          on:change={(e) => {
            fallbackToSimpler = e.detail
            void save({ fallbackToSimpler })
          }}
        />
        <div class="flex-col flex-gap-1">
          <Label label={aiBot.string.FallbackToSimpler} />
          <span class="content-dark-color text-sm"><Label label={aiBot.string.FallbackToSimplerHint} /></span>
        </div>
      </div>
    </div>
  </div>
</div>
