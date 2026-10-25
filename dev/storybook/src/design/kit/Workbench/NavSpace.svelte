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
  // Navigator space header: colored icon tile and the space name
  import { themeStore } from '@hcengineering/ui'
  import Icon from '../Icon.svelte'
  import { paletteDef } from '../palette'
  import type { IconName } from '../types'

  export let label: string
  export let icon: IconName | undefined = undefined
  export let color: string | undefined = undefined
</script>

<div class="group space">
  <span class="space-icon">
    <Icon name={icon ?? 'kit/HouseFill'} color={paletteDef(color ?? 'Porpoise', $themeStore.dark).color} />
  </span>
  <span class="caption">{label}</span>
</div>

<style lang="scss">
  .group {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: 2rem;
    padding: 0 0.25rem 0 0.5rem;

    &.space {
      gap: 0.375rem;
      margin: 0.25rem 0;
    }
  }
  .caption {
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--global-secondary-TextColor);
  }
  .space-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background-color: var(--theme-button-focused);
    border: 1px solid var(--global-ui-BackgroundColor);
    border-radius: 0.25rem;
  }
</style>
