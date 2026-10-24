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
  export let fill: string = 'currentColor'
</script>

<svg class="svg-{size}" fill="none" stroke={fill} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="12" height="12" rx="2" />
  <circle cx="6" cy="6" r="1.25" />
  <path d="M2 11.5 5.5 8l2.5 2.5L10.5 8l3.5 3.5" stroke-linejoin="round" />
</svg>
