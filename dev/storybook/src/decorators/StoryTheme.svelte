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
  import { Theme } from '@hcengineering/theme'
  import { deviceOptionsStore } from '@hcengineering/ui'

  import ThemeSync from './ThemeSync.svelte'

  export let theme: string
  export let accent: string
  export let language: string

  let docWidth = window.innerWidth
  let docHeight = window.innerHeight

  // The app's Root keeps the window size here; popups placed `top` (the date popup) are positioned by it.
  $: $deviceOptionsStore.docWidth = docWidth
  $: $deviceOptionsStore.docHeight = docHeight
</script>

<svelte:window bind:innerWidth={docWidth} bind:innerHeight={docHeight} />

<Theme>
  <ThemeSync {theme} {accent} {language} />
  <slot />
</Theme>
