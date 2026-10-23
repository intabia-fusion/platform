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
  // Borderless input of the settings pages and forms: the product EditBox
  import { EditBox } from '@hcengineering/ui'

  export let value: string
  // ghost-large: bordered title field, large-style: 20 px value, editbox: plain 14 px value
  export let kind: 'ghost-large' | 'large-style' | 'editbox' = 'ghost-large'
  export let width: number = 256
</script>

<div class="box" style:width="{width / 16}rem"><EditBox {kind} {value} /></div>

<style>
  .box {
    flex-shrink: 0;
  }
</style>
