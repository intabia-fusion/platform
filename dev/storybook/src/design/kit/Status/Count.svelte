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
  export let value: number
</script>

<span class="kit-count">{value}</span>

<style>
  .kit-count {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    height: 1.25rem;
    padding: 0 0.375rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    background-color: var(--theme-button-hovered);
    border-radius: 0.625rem;
  }
</style>
