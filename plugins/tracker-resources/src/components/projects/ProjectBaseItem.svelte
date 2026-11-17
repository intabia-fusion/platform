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
  import { Chip } from '@hcengineering/ui/kit'

  import tracker from '../../plugin'

  // A base project: the name, the archive mark and the identifier at the end
  export let project: Project
  export let showIdentifier: boolean = true
</script>

<span class="base-item">
  <span class="name overflow-label">{project.name}</span>
  {#if project.archived}
    <span class="chip"><Chip label={tracker.string.ProjectArchivedChip} kind="neutral" size="extra-small" /></span>
  {/if}
  {#if showIdentifier}
    <span class="identifier">{project.identifier}</span>
  {/if}
</span>

<style lang="scss">
  .base-item {
    display: flex;
    flex-grow: 1;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }
  .name {
    min-width: 0;
  }
  .chip {
    flex-shrink: 0;
  }
  .identifier {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
</style>
