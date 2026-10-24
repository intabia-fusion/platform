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
  // Vertical application rail: workspace logo, menu button, applications and the account avatar
  import { WorkspaceLogo } from '@hcengineering/ui'
  import TopMenu from '../../../../../../plugins/workbench-resources/src/components/icons/TopMenu.svelte'
  import Avatar from '../People/Avatar.svelte'
  import type { AppEntry, Person } from '../types'
  import AppItem from './AppItem.svelte'
  import Applications from './Applications.svelte'

  export let workspace: string
  export let apps: AppEntry[] = []
  export let account: Person
</script>

<div class="antiPanel-application vertical no-print">
  <div class="hamburger-container clear-mins landscape">
    <div class="logo-container clear-mins">
      <WorkspaceLogo name={workspace} accent />
    </div>
    <div class="topmenu-container clear-mins flex-no-shrink">
      <AppItem icon={TopMenu} label="Hide menu" size="medium" />
    </div>
    <Applications {apps} />
  </div>
  <div class="info-box vertical">
    <div class="flex-center mt-3">
      <div id="profile-button" class="cursor-pointer">
        <Avatar person={account} size={32} status />
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .antiPanel-application:not(.horizontal) {
    border-radius: var(--medium-BorderRadius) 0 0 var(--medium-BorderRadius);
    border-right: none;
  }
  .hamburger-container {
    position: relative;
    display: flex;
    align-items: center;
    z-index: 1;
    min-width: 0;

    &.landscape {
      flex-direction: column;
      margin-top: 1.25rem;

      .logo-container {
        margin-bottom: 0.25rem;
      }
      .topmenu-container {
        margin-bottom: 1rem;
      }
    }

    .logo-container,
    .topmenu-container {
      flex-shrink: 0;
    }
  }

  .info-box {
    display: flex;
    align-items: center;
    flex-shrink: 0;

    &.vertical {
      flex-direction: column;
      margin-bottom: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid var(--theme-navpanel-divider);
    }
  }
</style>
