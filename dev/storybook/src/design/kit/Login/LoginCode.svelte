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
  // Six cells of the one-time code with a gap after the third
  export let digits: string = ''
</script>

<div class="login-code">
  {#each [0, 1, 2, 3, 4, 5] as i}
    {#if i === 3}<span class="separator" />{/if}
    <span class="cell">{digits[i] ?? ''}</span>
  {/each}
</div>

<style lang="scss">
  .login-code {
    display: flex;
    align-items: center;
    gap: 6.4px;
    flex: none;
    width: 412px;
  }
  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 60px;
    height: 78px;
    font-size: 32px;
    color: #201240;
    background-color: #f3e5f5;
    border: 1px solid var(--theme-button-border);
    border-radius: 12px;
  }
  .separator {
    flex-shrink: 0;
    width: 12px;
    height: 1px;
    background-color: #e5e7eb;
  }
</style>
