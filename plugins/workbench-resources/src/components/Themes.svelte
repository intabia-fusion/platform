<!--
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script lang="ts">
  import platform, { getMetadata } from '@hcengineering/platform'
  import { PreviewControls } from '@hcengineering/ui'
  import { onMount } from 'svelte'

  // Check if we're in development mode
  const isDevelopment = getMetadata(platform.metadata.DevModel)

  if (!isDevelopment) {
    console.warn('Theme Preview is only intended for development use.')
  }

  // Define all accent themes
  const accents = [
    { id: 'intabia', name: 'Intabia', color: '#cf13a2' },
    { id: 'huly', name: 'Huly', color: '#3364e2' },
    { id: 'blue', name: 'Blue', color: '#3478f6' },
    { id: 'purple', name: 'Purple', color: '#8a4292' },
    { id: 'pink', name: 'Pink', color: '#e45c9c' },
    { id: 'red', name: 'Red', color: '#ce4745' },
    { id: 'orange', name: 'Orange', color: '#e8883a' },
    { id: 'yellow', name: 'Yellow', color: '#f6c94e' },
    { id: 'green', name: 'Green', color: '#78b856' },
    { id: 'graphite', name: 'Graphite', color: '#989898' }
  ]

  onMount(() => {
    document.documentElement.setAttribute('class', '')
  })
</script>

{#if isDevelopment}
  <div class="theme-preview-container">
    {#each accents as accent}
      <div class="accent-group flex flex-row-center">
        <!-- Light theme version -->
        <div class="theme-section">
          <h2>{accent.name}-Light Theme</h2>
          <div
            class="p-1 accent-container theme-light accent-{accent.id} accent-light-{accent.id}"
            style:background-color="var(--theme-drawing-bg-color)"
          >
            <PreviewControls {accent} />
          </div>
        </div>

        <div class="theme-section">
          <h2>{accent.name}-Dark Theme</h2>
          <div
            class="p-1 accent-container theme-dark accent-{accent.id} accent-dark-{accent.id}"
            style:background-color="var(--theme-drawing-bg-color)"
          >
            <PreviewControls {accent} />
          </div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="development-only-message">
    <h1>Theme Preview</h1>
    <p>This application is only available in development mode.</p>
    <p>Please use development environment to access this feature.</p>
  </div>
{/if}

<style lang="scss">
  .theme-preview-container {
    padding: 2rem;
    overflow: auto;
  }
</style>
