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
  import type { Ref } from '@hcengineering/core'
  import { getResource } from '@hcengineering/platform'
  import { createQuery } from '@hcengineering/presentation'
  import {
    onboardingHints,
    onboardingPreference,
    setOnboardingHints,
    updateOnboardingPreference
  } from '@hcengineering/view-resources'
  import { Breadcrumb, Button, Header, Label, Toggle } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import workbench, { type Application } from '@hcengineering/workbench'
  import { countOnboarding, getOnboardingGroups } from '@hcengineering/workbench-resources'
  import setting from '../plugin'

  let hiddenAppIds: Array<Ref<Application>> = []
  const hiddenAppsQuery = createQuery()
  hiddenAppsQuery.query(workbench.class.HiddenApplication, {}, (res) => {
    hiddenAppIds = res.map((r) => r.attachedTo)
  })

  $: ({ done: doneCount, total: totalCards } = countOnboarding(
    getOnboardingGroups(hiddenAppIds),
    $onboardingPreference?.completed ?? []
  ))

  async function openPanel (): Promise<void> {
    const fn = await getResource(workbench.function.OpenOnboarding)
    await fn()
  }

  async function startOver (): Promise<void> {
    await updateOnboardingPreference({ completed: [], dismissed: [], startedAt: Date.now() })
  }
</script>

<div class="hulyComponent">
  <Header adaptive={'disabled'}>
    <Breadcrumb icon={view.icon.TodoList} label={setting.string.Onboarding} size={'large'} isCurrent />
  </Header>
  <div class="flex-row-stretch flex-grow p-10">
    <div class="flex-grow flex-col flex-gap-4">
      <div class="flex-row-center flex-gap-4">
        <div class="flex-col flex-gap-1">
          <Label label={setting.string.ShowOnboardingHints} />
          <span class="text-sm content-color">
            <Label label={setting.string.ShowOnboardingHintsDescription} />
          </span>
        </div>
        <Toggle
          on={$onboardingHints}
          on:change={(e) => {
            void setOnboardingHints(e.detail)
          }}
        />
      </div>
      <div class="flex-row-center flex-gap-4">
        <span class="text-sm content-color">
          <Label label={setting.string.OnboardingProgress} params={{ done: doneCount, total: totalCards }} />
        </span>
        <Button
          label={setting.string.OnboardingOpenPanel}
          on:click={() => {
            void openPanel()
          }}
        />
        <Button
          label={setting.string.OnboardingStartOver}
          on:click={() => {
            void startOver()
          }}
        />
      </div>
    </div>
  </div>
</div>
