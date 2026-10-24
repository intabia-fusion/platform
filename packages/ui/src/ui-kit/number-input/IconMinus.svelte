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
  export let size: 'x-small' | 'small' | 'medium' | 'large'
  export let fill: string = 'currentColor'
</script>

<!-- The pair of the plus icon (components/icons/Add.svelte): same grid and stroke. -->
<svg class="svg-{size}" {fill} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path d="M3 7.5H13V8.5H3Z" />
</svg>
