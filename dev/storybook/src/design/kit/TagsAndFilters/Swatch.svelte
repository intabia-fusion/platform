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
  import { themeStore } from '@hcengineering/ui'
  import { paletteDef } from '../palette'

  // PaletteColorIndexes name or a CSS color
  export let color: string

  $: fill = paletteDef(color, $themeStore.dark).color
</script>

<span class="kit-swatch" style:background-color={fill} />

<style>
  .kit-swatch {
    display: inline-block;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 1.25rem;
    height: 1.25rem;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;
  }
</style>
