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
  // Outlined until set, filled gold once set; `amber` tints the outline too
  export let on = false
  export let amber = false
  export let pop = false
</script>

<svg class="star-mark" class:on class:amber class:pop viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.8l2.75 5.8 6.35.78-4.68 4.38 1.2 6.29L12 16.97l-5.62 3.08 1.2-6.29L2.9 9.38l6.35-.78z" />
</svg>

<style lang="scss">
  .star-mark {
    --_amber: #e5a400;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    fill: transparent;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
    transition: fill 0.15s ease;

    &.amber,
    &.on {
      stroke: var(--_amber);
    }
    &.on {
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
