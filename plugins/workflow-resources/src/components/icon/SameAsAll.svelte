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
  import type { IconSize } from '@hcengineering/ui'

  export let size: IconSize = 'small'
</script>

<svg class="svg-{size} rule-option-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <path
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M13 13H8a2.5 2.5 0 0 1-2.5-2.5V2.5M2.5 5.5L5.5 2.5L8.5 5.5"
  />
</svg>

<style lang="scss">
  .rule-option-icon {
    flex-shrink: 0;
    color: var(--global-secondary-TextColor);
  }
</style>
