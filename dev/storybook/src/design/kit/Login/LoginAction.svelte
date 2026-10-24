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
  // Link under the form, outside its padding (Login with code)
  export let text: string
</script>

<div class="login-action">{text}</div>

<style lang="scss">
  .login-action {
    flex: none;
    width: 460px;
    font-size: 14px;
    line-height: 1.3;
    color: #6e48ce;
    text-align: center;
  }
</style>
