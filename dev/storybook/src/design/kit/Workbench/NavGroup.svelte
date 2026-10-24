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
  // Navigator group caption with an optional add button
  import Button from '../Actions/Button.svelte'
  import Icon from '../Icon.svelte'

  export let label: string
  export let add: boolean | undefined = false
</script>

<div class="group">
  <span class="head">
    <span class="chevron"><Icon name="ui/Down" size={16} color="var(--global-tertiary-TextColor)" /></span>
    <span class="caption">{label}</span>
  </span>
  {#if add === true}<Button kind="tertiary" size="extra-small" icon="ui/Add" />{/if}
</div>

<style lang="scss">
  .group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: 2rem;
    margin: 0.75rem 0 0.25rem;
    padding: 0 0.25rem 0 0.5rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
  }
  .caption {
    padding: 0 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.25rem;
    text-transform: uppercase;
    color: var(--global-secondary-TextColor);
    background-color: var(--global-ui-BackgroundColor);
    border-radius: 0.25rem;
  }
</style>
