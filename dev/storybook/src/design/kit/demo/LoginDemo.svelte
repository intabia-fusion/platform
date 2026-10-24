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
  // Fixed-size white box for login parts: they are drawn for the white card, not for the platform panel
  import type { ComponentType } from 'svelte'

  export let component: ComponentType
  export let width: number
  export let height: number
  export let props: Record<string, unknown> = {}
</script>

<div class="box" style:width="{width}px" style:height="{height}px">
  <svelte:component this={component} {...props} />
</div>

<style lang="scss">
  .box {
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    background-color: #ffffff;
    border: 1px solid var(--theme-divider-color);
  }
</style>
