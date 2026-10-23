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
  export let label: string
  export let on: boolean = false
</script>

<span class="kit-quick-filter" class:on>{label}</span>

<style>
  .kit-quick-filter {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    height: 1.75rem;
    padding: 0 0.625rem;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.875rem;
  }
  .on {
    color: var(--primary-button-default);
    background-color: color-mix(in srgb, var(--primary-button-default) 10%, transparent);
    border-color: var(--primary-button-default);
  }
</style>
