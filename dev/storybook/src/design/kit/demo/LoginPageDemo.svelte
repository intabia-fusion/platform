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
  // The login page with the sign-in form, as the stand shows it
  import LoginButton from '../Login/LoginButton.svelte'
  import LoginCard from '../Login/LoginCard.svelte'
  import LoginField from '../Login/LoginField.svelte'
  import LoginForm from '../Login/LoginForm.svelte'
  import LoginPage from '../Login/LoginPage.svelte'
  import LoginStatus from '../Login/LoginStatus.svelte'
  import LoginTabs from '../Login/LoginTabs.svelte'
</script>

<LoginPage>
  <LoginCard>
    <LoginForm>
      <LoginTabs heading="Intabia Platform" tabs={['Sign up', 'Log In']} selected="Log In" />
      <div class="rows">
        <LoginField label="Email" value="demo1" />
        <LoginField label="Password" value="12345678" password />
        <LoginStatus />
        <LoginButton label="Log In" />
      </div>
    </LoginForm>
  </LoginCard>
</LoginPage>

<style lang="scss">
  .rows {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-top: 24px;
  }
</style>
