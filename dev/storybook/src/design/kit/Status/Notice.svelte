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
  import Icon from '../Icon.svelte'

  export let text: string
  export let kind: 'warning' | 'info' | 'negative' = 'warning'
  // Rounded one-line variant for headers
  export let pill: boolean = false
  // Fills the width of the container
  export let block: boolean = false
</script>

<div class="kit-notice {kind}" class:pill class:block>
  <Icon name={kind === 'info' ? 'eye' : 'warn'} />
  <span>{text}</span>
</div>

<style lang="scss">
  .kit-notice {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    border: 1px solid;
    border-radius: 0.375rem;

    &.block {
      display: flex;
    }
    &.pill {
      border-radius: 0.875rem;
    }
    &.warning {
      color: #8a5300;
      background-color: rgba(252, 197, 0, 0.12);
      border-color: rgba(252, 197, 0, 0.4);
    }
    &.info {
      color: var(--theme-state-primary-color);
      background-color: var(--theme-state-primary-background-color);
      border-color: var(--theme-state-primary-border-color);
    }
    &.negative {
      color: var(--theme-state-negative-color);
      background-color: var(--theme-state-negative-background-color);
      border-color: var(--theme-state-negative-border-color);
    }
  }
</style>
