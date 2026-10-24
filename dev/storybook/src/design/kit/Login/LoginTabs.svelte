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
  // Platform title above the Sign up / Log In tabs
  export let heading: string | undefined = undefined
  export let tabs: string[]
  export let selected: string
  export let width: number = 396
</script>

<div class="login-tabs" style:width="{width}px">
  {#if heading !== undefined}<div class="heading">{heading}</div>{/if}
  <div class="tabs">
    {#each tabs as tab}
      <span class="tab" class:selected={tab === selected}>{tab}</span>
    {/each}
  </div>
</div>

<style lang="scss">
  .login-tabs {
    display: flex;
    flex-direction: column;
    flex: none;
  }
  .heading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 36px;
    font-size: 28px;
    line-height: 1.3;
    color: #000061;
  }
  .tabs {
    display: flex;
    justify-content: center;
    gap: 28px;
  }
  .tab {
    padding-bottom: 6px;
    font-size: 20px;
    font-weight: 500;
    line-height: 1.3;
    color: #333333;
    border-bottom: 2px solid transparent;

    &.selected {
      font-weight: 600;
      border-bottom-color: #cf13a2;
    }
  }
</style>
