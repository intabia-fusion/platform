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
  // Row of the workspace list; the colors follow the platform theme, as in the product
  export let name: string
  export let note: string
  export let width: number = 428
</script>

<div class="login-workspace" style:width="{width}px">
  <span class="name">{name}</span>
  <span class="note">{note}</span>
</div>

<style lang="scss">
  .login-workspace {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: none;
    box-sizing: border-box;
    padding: 16px;
    font-size: 14px;
    line-height: 1.3;
    color: #201240;
    background-color: var(--theme-button-default);
    border: 1px solid var(--theme-button-border);
    border-radius: 16px;
  }
  .name {
    font-weight: 600;
  }
</style>
