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
  export let title: string
  export let note: string
</script>

<header>
  <h2>{title}</h2>
  <p class="note">{note}</p>
  <div class="controls">
    <slot />
    <span class="stats"><slot name="stats" /></span>
  </div>
</header>

<style lang="scss">
  header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }

  .note {
    margin: 0;
    max-width: 48rem;
    font-size: 0.75rem;
    color: var(--theme-content-color);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }

  .stats {
    font-size: 0.75rem;
    color: var(--theme-content-color);
  }
</style>
