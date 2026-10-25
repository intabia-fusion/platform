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
  import ui from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'

  // true lifts the column's width limit
  export let value: boolean | undefined
</script>

<!-- Always visible in the right gutter, so it stays put when the column changes width -->
<div class="max-width-toggle">
  <IconButton
    icon={value === true ? ui.icon.ArrowsInLineHorizontal : ui.icon.ArrowsOutLineHorizontal}
    kind="ghost"
    size="small"
    iconSize="medium"
    tooltip={{ label: value === true ? ui.string.CenteredWidth : ui.string.FullWidth }}
    data-id="btnMaxWidth"
    on:click={() => {
      value = value !== true
    }}
  />
</div>

<style lang="scss">
  // The gutter is 3.75rem wide at full width, the top matches the column's py-8
  .max-width-toggle {
    position: absolute;
    top: 2rem;
    right: calc((3.75rem - var(--global-small-Size)) / 2);
    z-index: 1;
  }
</style>
