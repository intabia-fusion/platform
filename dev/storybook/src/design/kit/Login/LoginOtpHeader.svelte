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
  // Header of the code step: back button, title and the address the code was sent to
  import Icon from '../Icon.svelte'

  export let title: string
  export let sent: string
  export let email: string
</script>

<div class="login-otp-header">
  <div class="title-row">
    <span class="back"><Icon name="kit/ArrowUturnLeft" size={16} color="#201240" /></span>
    <span class="title">{title}</span>
  </div>
  <div class="description"><span class="sent">{sent}</span><span class="email">{email}</span></div>
</div>

<style lang="scss">
  .login-otp-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: none;
    width: 412px;
  }
  .title-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
  }
  .back {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
  }
  .title {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    color: #000061;
  }
  .description {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 16px;
  }
  .sent {
    color: #333333;
  }
  .email {
    color: #000061;
  }
</style>
