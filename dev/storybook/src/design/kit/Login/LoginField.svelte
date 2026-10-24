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
  // Input of the login forms: the label sits inside, in the middle of an empty field and at the top with a value
  export let label: string
  export let value: string | undefined = undefined
  export let password: boolean = false
  export let error: boolean = false
  export let width: number = 396

  $: has = value !== undefined && value !== ''
  $: shown = password && value !== undefined ? '\u2022'.repeat(value.length) : value
</script>

<div class="login-field" class:error style:width="{width}px">
  <span class="label" class:up={has}>{label}</span>
  {#if has}<span class="value">{shown}</span>{/if}
</div>

<style lang="scss">
  .login-field {
    position: relative;
    flex: none;
    box-sizing: border-box;
    height: 52px;
    background-color: #f3e5f5;
    border: 1px solid #e5e7eb;
    border-radius: 12px;

    &.error {
      border-color: rgba(238, 122, 122, 0.6);
    }
  }
  .label {
    position: absolute;
    top: 16px;
    left: 20px;
    font-size: 12px;
    line-height: 1.3;
    color: #333333;
    opacity: 0.8;

    &.up {
      top: 8px;
    }
  }
  .value {
    position: absolute;
    top: 14px;
    left: 20px;
    display: flex;
    align-items: center;
    height: 36px;
    font-size: 14px;
    color: #201240;
  }
</style>
