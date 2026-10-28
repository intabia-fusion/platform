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
  import TypingDots from './TypingDots.svelte'
  import type { TypingIndicatorProps } from './types'

  type $$Props = TypingIndicatorProps

  export let typing: boolean = false
</script>

<span class="typing-indicator" class:typing-indicator--typing={typing}>
  <slot />
  <span class="typing-indicator__mark" aria-hidden="true"><TypingDots paused={!typing} /></span>
</span>

<style lang="scss">
  .typing-indicator {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;

    &__mark {
      position: absolute;
      right: -0.25rem;
      bottom: -0.1875rem;
      // Above the avatar presence dot, which it covers.
      z-index: 3;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: 1.25rem;
      height: 0.75rem;
      color: var(--button-brand-BackgroundColor);
      background-color: var(--theme-popup-color);
      border-radius: 0.5rem;
      box-shadow: inset 0 0 0 1px var(--theme-popup-divider);
      opacity: 0;
      transform: scale(0);
      transform-origin: 75% 75%;
      // A slight overshoot on the way in, so the mark pops instead of sliding.
      transition:
        opacity 0.15s ease,
        transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
    }
    &--typing &__mark {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-indicator__mark {
      transition-duration: 0s;
    }
  }
</style>
