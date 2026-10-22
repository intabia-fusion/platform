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
  import platform, { OK, Severity, Status } from '@hcengineering/platform'
  import { getCurrentLocation, navigate } from '@hcengineering/ui'

  import login from '../plugin'
  import { doLoginByLink, doLoginNavigate, goTo } from '../utils'
  import Form from './Form.svelte'

  export let navigateUrl: string | undefined = undefined

  let status: Status<any> = OK
  let failed = false

  // The token rides in the fragment, which never reaches proxy logs. It is dropped from the address
  // bar at once so that it stays out of history and page analytics; the click uses this copy.
  const loc = getCurrentLocation()
  const fragment = new URLSearchParams(loc.fragment ?? '')
  const token = fragment.get('token')
  if (loc.fragment != null && loc.fragment !== '') {
    navigate({ ...loc, fragment: undefined }, true)
  }

  // The token is spent only on the click: mail scanners open the link without clicking anything.
  const signInAction = {
    i18n: login.string.LogIn,
    func: async () => {
      if (token == null || token === '') {
        failed = true
        return
      }
      status = new Status(Severity.INFO, login.status.ConnectingToServer, {})
      const [loginStatus, result] = await doLoginByLink(token)
      // Only InvalidOtp means a dead link; a rate limit, a network error or a blocked account
      // is shown as is, and the link stays usable for another click.
      if (result == null && loginStatus.code === platform.status.InvalidOtp) {
        failed = true
        status = OK
        return
      }
      if (result == null) {
        status = loginStatus
        return
      }
      status = loginStatus
      await doLoginNavigate(
        result,
        (st) => {
          status = st
        },
        navigateUrl
      )
    }
  }

  const logInAction = {
    i18n: login.string.LogIn,
    func: async () => {
      goTo('login', true)
    }
  }
</script>

{#if failed}
  <Form caption={login.string.LoginLinkInvalid} {status} fields={[]} object={{}} action={logInAction} />
{:else}
  <Form caption={login.string.LoginLinkCaption} {status} fields={[]} object={{}} action={signInAction} />
{/if}
