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
  // Form button: primary (accent), default (outlined) or a provider on black with its icon
  import Github from '../../../../../../plugins/login-resources/src/components/icons/Github.svelte'
  import Google from '../../../../../../plugins/login-resources/src/components/icons/Google.svelte'
  import OpenId from '../../../../../../plugins/login-resources/src/components/icons/OpenId.svelte'

  export let label: string
  export let kind: 'primary' | 'default' | 'provider' = 'primary'
  export let disabled: boolean = false
  export let icon: 'google' | 'github' | 'openid' | undefined = undefined
  export let width: number | undefined = undefined

  const icons = { google: Google, github: Github, openid: OpenId }
</script>

<div class="login-button {kind}" class:disabled style:width={width !== undefined ? `${width}px` : '100%'}>
  {#if icon !== undefined}<svelte:component this={icons[icon]} />{/if}
  <span class="label">{label}</span>
</div>

<style lang="scss">
  .login-button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    gap: 8px;
    box-sizing: border-box;
    height: 56px;
    padding: 0 24px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    border: 0 solid transparent;
    border-radius: 8px;

    &.primary {
      color: #ffffff;
      background-color: #cf13a2;
    }
    &.default {
      color: #201240;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
    }
    &.provider {
      font-weight: 400;
      color: #ffffff;
      background-color: #07040f;
      border: 1px solid transparent;
    }
    &.disabled {
      color: #9ca3af;
      background-color: #f3eafb;
      border-color: transparent;
    }
  }
  .provider :global(svg) {
    color: #ffffff;
  }
</style>
