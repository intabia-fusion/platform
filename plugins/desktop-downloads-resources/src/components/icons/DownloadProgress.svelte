<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  export let size: 'small' | 'medium' | 'large' = 'medium'
  export let fill: string = 'var(--theme-caption-color)'
  export let progress: number = 0

  const circumference = 2 * Math.PI * 13
  $: strokeDashoffset = circumference * (1 - progress / 100)
</script>

<svg class="svg-{size}" {fill} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <!-- The ring is thicker than the kit line so the progress reads at the status bar size -->
  <circle cx="16" cy="16" r="13" fill="none" stroke={fill} stroke-width="3.33" opacity="0.2" />
  <circle
    cx="16"
    cy="16"
    r="13"
    fill="none"
    stroke={fill}
    stroke-width="3.33"
    stroke-linecap="round"
    stroke-dasharray={circumference}
    stroke-dashoffset={strokeDashoffset}
    transform="rotate(-90 16 16)"
    style="transition: stroke-dashoffset 0.3s ease;"
  />
  <path
    d="M16 9V22M10.5 16.5L16 22L21.5 16.5"
    fill="none"
    stroke={fill}
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
