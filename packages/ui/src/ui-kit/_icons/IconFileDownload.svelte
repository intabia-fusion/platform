<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { IconSize } from '../../types'

  export let size: IconSize = 'small'
  const fill: string = 'currentColor'
</script>

<svg class="svg-{size}" {fill} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M15 5h2v13.586l4.293-4.293 1.414 1.414L16 22.414l-6.707-6.707 1.414-1.414L15 18.586V5z" />
  <path d="M5 21h2v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4h2v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4z" />
</svg>
