<!--
// Copyright © 2026 Intabia Fusion.
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
  import { getCurrentLocation, navigate } from '@hcengineering/ui'
  import Label from './internal/Label.svelte'

  import login from '../plugin'
  import { loginTheme } from '../theme'

  export let loginState: 'login' | 'signup' | 'none' = 'none'
  export let signUpDisabled = false

  const goTab = (path: string): void => {
    const loc = getCurrentLocation()
    loc.path[1] = path
    loc.path.length = 2
    navigate(loc)
  }
</script>

<div class="flex" style:justify-content={$loginTheme.showLoginTitle ? 'center' : 'left'}>
  <div class="flex-row-center caption">
    {#if !signUpDisabled}
      <a
        class="title"
        class:selected={loginState === 'signup'}
        href="."
        on:click|preventDefault={() => {
          if (loginState !== 'signup') goTab('signup')
        }}
      >
        <Label label={login.string.SignUpTab} />
      </a>
    {/if}
    <a
      class="title"
      class:selected={loginState === 'login'}
      href="."
      on:click|preventDefault={() => {
        if (loginState !== 'login') goTab('login')
      }}
    >
      <Label label={login.string.LogIn} />
    </a>
  </div>
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--login-caption-color, var(--theme-caption-color));
  }
  .caption a {
    padding-bottom: 0.375rem;
    border-bottom: 2px solid var(--login-caption-color, var(--theme-caption-color));

    &:not(.selected) {
      color: var(--login-dark-color, var(--theme-dark-color));
      border-bottom-color: transparent;

      &:hover {
        color: var(--login-caption-color, var(--theme-caption-color));
      }
    }
    &.selected {
      cursor: default;
      color: var(--login-primary-button-default, var(--primary-button-default));
      border-bottom-color: var(--login-primary-button-default, var(--primary-button-default));
      font-weight: 600;
    }
    &:first-child {
      margin-right: 1.75rem;
    }
    &:hover {
      text-decoration: none;
    }
  }

  /* main-heading styles are now controlled by the Intabia theme (plugins/login-resources/src/components/themes/intabia.scss) */
</style>
