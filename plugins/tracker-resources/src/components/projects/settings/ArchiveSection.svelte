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
  import type { Project } from '@hcengineering/tracker'
  import { canArchiveSpace } from '@hcengineering/view-resources'
  import { Button, Callout } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'

  import tracker from '../../../plugin'
  import { deleteProject } from '../../../projectActions'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'

  export let project: Project
</script>

<ProjectSettingsSection
  title={tracker.string.ProjectSettingsArchive}
  description={tracker.string.ProjectSettingsArchiveDescription}
>
  <div class="flex-col flex-gap-4 archive" data-id="project-settings-archive">
    <Callout tone="info" label={tracker.string.ProjectSettingsArchiveNotice} />
    {#await canArchiveSpace(project) then allowed}
      <Button
        data-id="btnArchiveProject"
        kind="negative"
        size="small"
        icon={view.icon.Delete}
        iconSize="small"
        label={tracker.string.ArchiveProject}
        disabled={!allowed}
        on:click={async () => {
          await deleteProject(project)
        }}
      />
    {/await}
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .archive {
    align-items: flex-start;
  }
</style>
