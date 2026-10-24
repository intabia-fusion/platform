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
  // White panel of the login page, 460 wide; forms go inside
</script>

<div class="login-card"><slot /></div>

<style lang="scss">
  .login-card {
    display: flex;
    flex-direction: column;
    flex: none;
    box-sizing: border-box;
    width: 460px;
    padding: 16px 0 32px;
    background: radial-gradient(161.92% 96.11% at 11.33% 3.89%, #eeeeee 0%, #ffffff 100%);
    border-radius: 16px;
    box-shadow: -30px 1.52px 173.87px #121437;
  }
</style>
