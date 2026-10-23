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
  import { Scroller } from '@hcengineering/ui'
  import type { AppEntry } from '../types'
  import AppItem from './AppItem.svelte'

  // A divider follows an entry marked `divider`, as top, middle and bottom apps are separated in the original.
  export let apps: AppEntry[] = []
</script>

<div class="flex-col-center clear-mins apps-vertical relative">
  <Scroller invertScroll padding=".5rem .75rem" gap="gapV-1" align="start" buttons="union">
    {#each apps as app}
      <AppItem
        icon={app.icon}
        label={app.label ?? app.icon}
        selected={app.selected ?? false}
        navigator={app.selected ?? false}
        notify={app.notify ?? false}
      />
      {#if app.divider === true}<div class="divider" />{/if}
    {/each}
    <div class="apps-space-vertical" />
  </Scroller>
</div>

<style lang="scss">
  .apps-vertical {
    margin-bottom: 0.5rem;
    width: var(--app-panel-width);
    min-width: 4rem;
  }
  .divider {
    flex-shrink: 0;
    margin: 0.5rem 0;
    width: 2.25rem;
    height: 1px;
    background-color: var(--theme-navpanel-icons-divider);
  }
  .apps-space-vertical {
    min-height: 0.5rem;
    height: 0.5rem;
  }
</style>
