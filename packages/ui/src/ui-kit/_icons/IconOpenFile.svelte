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
  export let size: 'x-small' | 'small' | 'medium' | 'large' = 'small'
</script>

<!-- Drawn smaller: corner to corner it reads larger than the neighbouring header icons. -->
<svg class="svg-{size}" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
  <path d="M19 4v2h5.586l-6.293 6.293a1 1 0 0 0 1.414 1.414L26 7.414V13h2V4h-9z" />
  <path d="M13.707 19.707a1 1 0 0 0-1.414-1.414L6 24.586V19H4v9h9v-2H7.414l6.293-6.293z" />
</svg>
