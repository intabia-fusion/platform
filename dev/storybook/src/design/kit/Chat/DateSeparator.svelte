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
  // Day divider of a message list: a pill with the date centered on a thin line
  export let label: string
</script>

<div class="kit-date-separator">
  <div class="line" />
  <span class="date">{label}</span>
</div>

<style lang="scss">
  .kit-date-separator {
    position: relative;
    flex-shrink: 0;
    width: 100%;
    height: 2.0625rem;
  }
  .line {
    position: absolute;
    top: 1rem;
    width: 100%;
    height: 1px;
    background-color: var(--highlight-select-border);
  }
  .date {
    position: absolute;
    top: 0.25rem;
    left: 50%;
    box-sizing: border-box;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    color: var(--theme-content-color);
    background-color: var(--highlight-select);
    border: 1px solid var(--highlight-select-border);
    border-radius: 1rem;
    transform: translateX(-50%);
  }
</style>
