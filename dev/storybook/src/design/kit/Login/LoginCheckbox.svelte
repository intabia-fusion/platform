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
  // Consent or option line of the signup form
  export let checked: boolean
  export let label: string
  export let invalid: boolean = false
</script>

<div class="login-check">
  <span class="box" class:checked class:invalid />
  <span class="label">{label}</span>
</div>

<style lang="scss">
  .login-check {
    display: flex;
    gap: 8px;
    flex: none;
    box-sizing: border-box;
    width: 396px;
    font-size: 15.2px;
    color: #201240;
  }
  .box {
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    margin: 3px 3px 3px 4px;
    background: #ffffff;
    border: 2px solid rgba(0, 0, 0, 0.4);
    border-radius: 3.2px;

    &.invalid {
      border-color: #ee7a7a;
    }
    &.checked {
      background: #cf13a2;
      border-color: #cf13a2;
    }
    &.checked::after {
      position: absolute;
      top: 1px;
      left: 5px;
      width: 4px;
      height: 9px;
      content: '';
      border: solid #ffffff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
  }
</style>
