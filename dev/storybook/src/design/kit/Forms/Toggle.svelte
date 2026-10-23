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
  // Switch of the product Toggle (36x20) with an optional label
  import { Toggle } from '@hcengineering/ui'

  export let on: boolean = false
  export let label: string | undefined = undefined
</script>

<div class="kit-toggle">
  <Toggle {on} />
  {#if label !== undefined}<span class="label">{label}</span>{/if}
</div>

<style lang="scss">
  .kit-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .label {
    color: var(--theme-caption-color);
  }
</style>
