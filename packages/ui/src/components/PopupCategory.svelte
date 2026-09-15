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
  import type { IntlString } from '@hcengineering/platform'

  import Label from './Label.svelte'

  export let title: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let kind: 'divider' | 'heading' = 'divider'
</script>

<div class="hulyPopup-category" class:heading={kind === 'heading'}>
  {#if kind === 'divider'}<div class="hulyPopup-line" />{/if}
  <span class="hulyPopup-category-label">
    {#if title !== undefined}{title}{:else if label !== undefined}<Label {label} />{/if}
  </span>
  {#if kind === 'divider'}<div class="hulyPopup-line" />{/if}
</div>

<style lang="scss">
  .hulyPopup-category {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1_5) var(--spacing-1) var(--spacing-0_5) var(--spacing-1);
    min-width: 0;
    overflow: hidden;

    &.heading {
      padding: var(--spacing-1) var(--spacing-1_5) var(--spacing-0_5);
    }

    &-label {
      font-size: 0.625rem;
      font-weight: 500;
      color: var(--global-tertiary-TextColor);
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .hulyPopup-line {
      flex: 1;
      height: 1px;
      background-color: var(--theme-popup-divider);
      min-width: 0.5rem;
    }
  }
</style>
