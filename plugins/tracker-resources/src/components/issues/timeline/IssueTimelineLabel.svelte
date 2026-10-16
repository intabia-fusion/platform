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
  import type { Issue } from '@hcengineering/tracker'
  import { openDocInSidebar } from '@hcengineering/view-resources'

  export let value: Issue
</script>

<div class="flex-row-center min-w-0">
  <div class="flex-col min-w-0">
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <span
      class="over-underline cursor-pointer overflow-label text-sm content-dark-color"
      on:click={() => {
        void openDocInSidebar(value)
      }}
    >
      {value.identifier}
    </span>
    <span class="overflow-label">{value.title}</span>
  </div>
</div>
