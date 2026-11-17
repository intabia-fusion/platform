<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { DocumentQuery, Ref } from '@hcengineering/core'
  import type { IssueTemplate, Project } from '@hcengineering/tracker'
  import ui, { getCurrentLocation } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { openProjectSettings, openProjectSection } from '../../projectSettings'
  import tracker from '../../plugin'
  import IssueTemplatesView from './IssueTemplatesView.svelte'

  export let currentSpace: Ref<Project> | undefined = undefined

  $: query = (currentSpace === undefined ? {} : { space: currentSpace }) satisfies DocumentQuery<IssueTemplate>
  const fromSettings = getCurrentLocation().query?.fromProjectSettings
</script>

<IssueTemplatesView {query} space={currentSpace} title={tracker.string.IssueTemplates}>
  <svelte:fragment slot="afterHeader">
    {#if currentSpace !== undefined && fromSettings === 'issues'}
      <div class="p-3">
        <Button
          data-id="templatesBackToSettings"
          kind="ghost"
          size="small"
          icon={ui.icon.ChevronLeftLarge}
          label={tracker.string.ProjectSettings}
          on:click={() => {
            if (currentSpace === undefined) return
            openProjectSettings(currentSpace)
            openProjectSection('issues')
          }}
        />
      </div>
    {/if}
  </svelte:fragment>
</IssueTemplatesView>
