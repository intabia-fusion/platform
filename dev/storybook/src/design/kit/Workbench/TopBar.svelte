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
  // Status bar of the workbench: the open tab on the left, workspace tools and clock on the right
  import { IconAdd, ModernTab, StatusBarButton } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import Clock from '../../../../../../packages/ui/src/components/internal/Clock.svelte'
  import ConnectionStatus from '../../../../../../packages/ui/src/components/internal/ConnectionStatus.svelte'
  import Settings from '../../../../../../packages/ui/src/components/internal/icons/Settings.svelte'
  import { spriteAssets } from '../../setup'
  import type { IconName } from '../types'

  export let tab: { label: string, icon: IconName }
</script>

<div class="antiStatusBar">
  <div class="flex-row-center h-full content-color gap-3 px-4 py-2">
    <div class="flex-row-center left-items flex-gap-1">
      <div class="flex-row-center flex-gap-2" style:padding="0 .25rem 0 0">
        <div class="flex-row-center gap-1 py-1 overflow-x-auto">
          <ModernTab
            label={tab.label}
            icon={spriteAssets.get(tab.icon.toLowerCase())}
            maxSize="12rem"
            highlighted
            canClose={false}
          />
        </div>
        <IconButton
          icon={IconAdd}
          iconProps={{ fill: 'var(--theme-dark-color)' }}
          size="extra-small"
          kind="tertiary"
          aria-label="New tab"
        />
      </div>
    </div>
    <div class="flex-row-center justify-center status-info" />
    <div class="flex-row-reverse flex-gap-0-5">
      <StatusBarButton icon={Settings} />
      <ConnectionStatus />
      <Clock />
    </div>
  </div>
</div>

<style lang="scss">
  .antiStatusBar {
    min-width: 0;
    min-height: var(--status-bar-height);
    height: var(--status-bar-height);
    font-size: 0.75rem;
    line-height: 150%;
    background-color: var(--theme-statusbar-color);
    z-index: 1;

    .status-info {
      flex-grow: 1;
      text-align: center;
    }
  }
  .left-items {
    overflow-x: auto;
  }
</style>
