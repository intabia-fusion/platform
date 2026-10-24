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
  import { formatBadge, type AttachmentFormat } from '@hcengineering/attachment'
  import { FileBadge } from '@hcengineering/ui/kit'

  export let format: AttachmentFormat
  // Passed by the menus to every icon; a badge has its own size and colour.
  export let size: string | undefined = undefined
  export let fill: string | undefined = undefined
  void size
  void fill
</script>

<!-- Without a name the badge reads the short label of the format. -->
<span class="format-icon"><FileBadge {...formatBadge(format, '')} variant="menu" /></span>

<style lang="scss">
  .format-icon {
    display: inline-flex;
  }

  // A menu sizes its icon cell for a square glyph; the badge is wider and would run into the label.
  :global(.hulyPopup-row__icon:has(.format-icon)) {
    width: auto;
  }
</style>
