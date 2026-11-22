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
  import { getMetadata, setMetadata } from '@hcengineering/platform'
  import { onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import login from '../../../../plugins/login/src'
  import PasswordRequest from '../../../../plugins/login-resources/src/components/PasswordRequest.svelte'
  import PasswordRestore from '../../../../plugins/login-resources/src/components/PasswordRestore.svelte'
  import LoginAppBase from '../../../../plugins/login-resources/src/components/LoginAppBase.svelte'
  import { loginThemeName, setLoginTheme } from '../../../../plugins/login-resources/src/theme'

  export let step: 'request' | 'restore' = 'request'
  let submitted = false
  const previousCopyright = getMetadata(login.metadata.Copyright)
  const previousTheme = getMetadata(login.metadata.LoginTheme)
  const previousThemeName = get(loginThemeName)
  setMetadata(login.metadata.Copyright, login.string.IntabiaFusion)
  setMetadata(login.metadata.LoginTheme, 'intabia')
  setLoginTheme('intabia')
  onDestroy(() => {
    setMetadata<string | undefined>(login.metadata.Copyright, previousCopyright)
    setMetadata<string | undefined>(login.metadata.LoginTheme, previousTheme)
    setLoginTheme(previousThemeName)
  })

  function intercept (event: MouseEvent | KeyboardEvent | SubmitEvent): void {
    const target = event.target
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return
    if (event instanceof MouseEvent && (!(target instanceof Element) || target.closest('.send button, a') === null)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!(target instanceof Element) || target.closest('a') === null) submitted = true
  }
</script>

<LoginAppBase>
  <svelte:fragment slot="form-content">
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div on:click|capture={intercept} on:keydown|capture={intercept} on:submit|capture={intercept}>
      {#if step === 'request'}<PasswordRequest />{:else}<PasswordRestore />{/if}
    </div>
    {#if submitted}<p role="status">Демонстрация: запрос не отправлен.</p>{/if}
  </svelte:fragment>
</LoginAppBase>
