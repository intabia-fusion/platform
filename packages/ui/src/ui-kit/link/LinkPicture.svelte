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
  import Skeleton from '../skeleton/Skeleton.svelte'
  import { revealImage } from './utils'

  export let src: string | undefined = undefined
  export let fit: 'cover' | 'contain' = 'cover'
  /** A wash under a picture that may not fill the box; it gives way to the skeleton while loading. */
  export let tinted: boolean = false
  // The address that failed, not a flag: another picture on the same card is tried.
  export let broken: string | undefined = undefined
</script>

{#if src != null && src !== broken}
  <span class="link-picture" class:tinted>
    <span class="loader"><Skeleton width="100%" height="100%" radius="0" delay="0.15s" /></span>
    <img
      class={fit}
      {src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      use:revealImage={src}
      on:error={() => (broken = src)}
    />
  </span>
{:else}
  <slot />
{/if}

<style lang="scss">
  .link-picture {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;

    &.tinted {
      background-color: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);
    }

    img {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;

      &.cover {
        object-fit: cover;
      }
      &.contain {
        object-fit: contain;
      }

      &:global(.revealing) {
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      &:global(.revealed) {
        opacity: 1;
      }
    }

    // The skeleton waits under the picture; a cached one shows at once and never meets it.
    .loader {
      position: absolute;
      inset: 0;
      display: none;
    }

    &:global(.picture-loading) {
      &.tinted {
        background-color: transparent;
      }

      .loader {
        display: flex;
      }
    }
  }
</style>
