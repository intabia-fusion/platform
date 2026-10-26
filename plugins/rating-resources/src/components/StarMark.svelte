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
  import { getMetadata } from '@hcengineering/platform'
  import ui from '@hcengineering/ui'

  // Outlined until set, filled gold once set; `amber` tints the outline too
  export let on = false
  export let amber = false
  export let pop = false
</script>

<svg class="star-mark" class:on class:amber class:pop aria-hidden="true">
  {#if on}<use class="star-mark__fill" href={getMetadata(ui.icon.StarFill)} />{/if}
  <use class="star-mark__line" href={getMetadata(ui.icon.Star)} />
</svg>

<style lang="scss">
  .star-mark {
    --_amber: #e5a400;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
    transition: fill 0.15s ease;

    &.amber,
    &.on {
      fill: var(--_amber);
    }
    .star-mark__fill {
      fill: #ffc21a;
    }
    &.pop {
      animation: star-pop 0.35s cubic-bezier(0.3, 1.6, 0.6, 1);
    }
  }

  @keyframes star-pop {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.4) rotate(-12deg);
    }
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .star-mark.pop {
      animation: none;
    }
  }
</style>
