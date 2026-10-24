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
  // Provider buttons in a grid: two columns for an even count, one otherwise
  import LoginButton from './LoginButton.svelte'

  // [icon, label]
  export let items: Array<['google' | 'github' | 'openid', string]>
  export let width: number = 396
</script>

<div
  class="login-providers"
  style:width="{width}px"
  style:grid-template-columns="repeat({items.length % 2 === 0 ? 2 : 1}, 1fr)"
>
  {#each items as [icon, label]}
    <LoginButton {label} {icon} kind="provider" />
  {/each}
</div>

<style lang="scss">
  .login-providers {
    display: grid;
    flex: none;
    box-sizing: border-box;
    gap: 16px;
    padding-top: 16px;
  }
</style>
