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
  // Stand-ins for the value icons of real selectors (status, priority, component, ...), which live in plugins.
  export let size: 'x-small' | 'small' | 'medium' | 'large' = 'small'
  export let fill: string = 'currentColor'
  export let glyph: 'space' | 'backlog' | 'progress' | 'priority' | 'high' | 'component' | 'milestone' | 'tag' =
    'component'
</script>

<svg class="svg-{size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  {#if glyph === 'space'}
    <circle cx="8" cy="8" r="6.5" fill="#2f6fe4" />
  {:else if glyph === 'backlog'}
    <circle cx="8" cy="8" r="6" fill="none" stroke={fill} stroke-width="1.5" stroke-dasharray="2 2" />
  {:else if glyph === 'progress'}
    <circle cx="8" cy="8" r="6" fill="none" stroke="#3a7af2" stroke-width="1.5" />
    <path d="M8 4a4 4 0 0 1 0 8z" fill="#3a7af2" />
  {:else if glyph === 'priority'}
    <rect x="2" y="7.25" width="12" height="1.5" rx=".75" {fill} />
  {:else if glyph === 'high'}
    <rect x="2" y="9" width="3" height="5" rx="1" fill="#e8a33b" />
    <rect x="6.5" y="5.5" width="3" height="8.5" rx="1" fill="#e8a33b" />
    <rect x="11" y="2" width="3" height="12" rx="1" fill="#e8a33b" />
  {:else if glyph === 'component'}
    <path d="M8 1.8 14.2 8 8 14.2 1.8 8z" fill="none" stroke={fill} stroke-width="1.3" />
  {:else if glyph === 'milestone'}
    <path d="M3 14V2h8l2 2.5L11 7H3" fill="none" stroke={fill} stroke-width="1.3" />
  {:else}
    <path d="M2 2h6l6 6-6 6-6-6z" fill="none" stroke={fill} stroke-width="1.3" />
    <circle cx="5.5" cy="5.5" r="1" {fill} />
  {/if}
</svg>
