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
  // Padded container of one form inside the card: [top, right, bottom, left]
  export let pad: [number, number, number, number] = [32, 32, 32, 32]
</script>

<div class="login-form" style:padding={pad.map((v) => `${v}px`).join(' ')}><slot /></div>

<style lang="scss">
  .login-form {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
  }
</style>
