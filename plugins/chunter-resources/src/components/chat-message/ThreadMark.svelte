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
  import chunter from '@hcengineering/chunter'
  import { Icon, Label } from '@hcengineering/ui'
</script>

<!-- After the place in a chip: the reply sits in a thread there, not in the place itself. -->
<span class="thread font-medium-12 secondary-textColor">
  <span>›</span>
  <span class="icon"><Icon icon={chunter.icon.Thread} size="x-small" /></span>
  <Label label={chunter.string.Thread} />
</span>

<style lang="scss">
  // The place gives way first: "thread" is short and is the point.
  .thread {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--spacing-0_5);
    white-space: nowrap;
  }

  .icon {
    display: flex;
    flex-shrink: 0;
  }
</style>
