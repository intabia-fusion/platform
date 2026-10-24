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
  // Caption of a form without tabs, the workspace or the person above it
  export let text: string
  export let subtitle: string | undefined = undefined
</script>

<div class="login-title">
  {#if subtitle !== undefined}<div class="subtitle">{subtitle}</div>{/if}
  <div class="text">{text}</div>
</div>

<style lang="scss">
  .login-title {
    display: flex;
    flex-direction: column;
    flex: none;
    width: 396px;
  }
  .subtitle {
    font-size: 14px;
    line-height: 1.3;
    color: #201240;
  }
  .text {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    color: #333333;
  }
</style>
