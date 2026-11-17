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
  import type { TypingDotsProps } from './types'

  type $$Props = TypingDotsProps

  export let paused: boolean = false
</script>

<span class="typing-dots" class:typing-dots--paused={paused} aria-hidden="true">
  <span class="typing-dots__dot" />
  <span class="typing-dots__dot" />
  <span class="typing-dots__dot" />
</span>

<style lang="scss">
  .typing-dots {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.125rem;

    &__dot {
      width: 0.1875rem;
      height: 0.1875rem;
      border-radius: 50%;
      background-color: currentColor;
      animation: wave 1.2s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }
      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
    &--paused .typing-dots__dot {
      animation-play-state: paused;
    }
  }

  @keyframes wave {
    0%,
    60%,
    100% {
      opacity: 0.5;
      transform: translateY(0);
    }
    30% {
      opacity: 1;
      transform: translateY(-0.0625rem);
    }
  }

  @keyframes fade {
    0%,
    60%,
    100% {
      opacity: 0.5;
    }
    30% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-dots__dot {
      animation-name: fade;
    }
  }
</style>
