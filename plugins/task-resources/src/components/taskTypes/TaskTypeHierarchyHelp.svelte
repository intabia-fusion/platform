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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { Label } from '@hcengineering/ui'

  import task from '../../plugin'

  export let child: string
  // Comma-separated parent names of the example, empty when the project has none
  export let parents: string = ''
</script>

<div class="help flex-col gap-2 font-regular-12">
  <Label label={task.string.HierarchyHelpWhat} />
  <Label label={task.string.HierarchyHelpRoot} />
  <Label label={task.string.HierarchyHelpParents} />
  {#if parents !== ''}
    <Label label={task.string.HierarchyHelpExample} params={{ child, parents }} />
  {/if}
</div>

<style lang="scss">
  .help {
    max-width: 22rem;
    padding: 0.5rem;
    line-height: 1.25rem;
  }
</style>
