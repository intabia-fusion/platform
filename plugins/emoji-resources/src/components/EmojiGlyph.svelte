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

  export let emoji: string | undefined
  export let fontSize: string
  // Passed by Icon: the glyph is sized by fontSize and keeps its own colors.
  export const size: IconSize | undefined = undefined
  export const fill: string | undefined = undefined
</script>

<span class="emoji" style:font-size={fontSize}>{emoji ?? ''}</span>
