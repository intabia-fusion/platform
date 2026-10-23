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
  export let hint: string | undefined = undefined
</script>

<div class="kit-section-title">
  <span class="title">{title}</span>
  {#if hint !== undefined}<span class="hint">{hint}</span>{/if}
</div>

<style>
  .kit-section-title {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 47.5rem;
  }
  .title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
</style>
