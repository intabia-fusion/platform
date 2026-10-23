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

<svg
  class="svg-{size}"
  viewBox="0 0 32 32"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="5" y="6" width="22" height="20" rx="3" />
  <circle cx="12" cy="12.5" r="2" />
  <path d="M5 22l6.5-5.5 4.5 3.5 4-3 6 5" />
</svg>
