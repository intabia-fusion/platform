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
  export let width: string = '100%'
  export let height: string = '0.625rem'
  export let radius: string = '0.3125rem'
  /** The shine starts this late, so a load quicker than that shows only the plate. */
  export let delay: string | undefined = undefined
</script>

<span
  class="skeleton"
  style:width
  style:height
  style:border-radius={radius}
  style:animation-delay={delay}
  aria-hidden="true"
/>

<style lang="scss">
  .skeleton {
    --skeleton-base: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);
    --skeleton-shine: color-mix(in srgb, var(--theme-caption-color) 13%, transparent);
    display: inline-block;
    flex-shrink: 0;
    max-width: 100%;
    vertical-align: middle;
    background: linear-gradient(90deg, var(--skeleton-base) 0%, var(--skeleton-shine) 40%, var(--skeleton-base) 80%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite backwards;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
