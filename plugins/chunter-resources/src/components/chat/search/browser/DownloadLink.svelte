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
  import presentation from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'

  export let href: string
  export let name: string
</script>

<!-- Said in words next to the size: an icon over the preview was easy to miss. -->
<a class="download" {href} download={name} on:click|stopPropagation on:keydown|stopPropagation>
  <Label label={presentation.string.Download} />
</a>

<style lang="scss">
  .download {
    flex-shrink: 0;
    color: var(--theme-link-color);
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }
</style>
