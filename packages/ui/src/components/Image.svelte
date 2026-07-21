<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { createEventDispatcher } from 'svelte'

  export let src: string | undefined
  export let srcset: string | undefined = undefined
  export let alt: string | undefined = undefined
  export let width: number | string
  export let height: number | string
  export let fit: string = 'contain'
  export let loading: 'lazy' | 'eager' = 'eager'

  const dispatch = createEventDispatcher()

  const MAX_RETRIES = 3
  let retry: number = MAX_RETRIES

  function handleLoad (): void {
    retry = MAX_RETRIES
    dispatch('load')
  }

  function handleLoadStart (): void {
    dispatch('loadstart')
  }

  $: if (src !== undefined) {
    retry = MAX_RETRIES
    handleLoadStart()
  }

  function handleError (event: any): void {
    if (retry > MAX_RETRIES) {
      event.target.src = undefined
    } else if (retry > 0) {
      event.target.src = `${src}#${Date.now()}`
      retry -= 1
    } else {
      dispatch('error')
    }
  }
</script>

<img
  {src}
  {srcset}
  alt={alt ?? ''}
  {loading}
  style:object-fit={fit}
  style:width={typeof width === 'number' ? 'auto' : width}
  style:height={typeof height === 'number' ? 'auto' : height}
  style:max-width={typeof width === 'number' ? `${width}px` : undefined}
  style:max-height={typeof height === 'number' ? `${height}px` : undefined}
  on:error={handleError}
  on:loadstart={handleLoadStart}
  on:load={handleLoad}
/>

<style lang="scss">
  img {
    border-radius: inherit;
  }
</style>
