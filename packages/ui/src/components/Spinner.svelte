<!--
// Copyright © 2020 Anticrm Platform Contributors.
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
  import type { ButtonSize } from '../types'

  export let size: ButtonSize = 'medium'
  // Color variants:
  // - 'default' keeps current behavior (uses caption color or an override via --spinner-color)
  // - 'accent' uses the primary/accent color (e.g. Intabia accent) so spinner is visible on light backgrounds
  export let color: 'default' | 'accent' | string = 'default'

  // Resolve the spinner color. Allow a CSS override via --spinner-color for flexibility.
  $: spinnerColor =
    color === 'accent'
      ? 'var(--primary-button-default, var(--accent-color-base, var(--caption-color)))'
      : 'var(--spinner-color, var(--caption-color))'
</script>

<div class="spinner spinner-{size}">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <linearGradient id="a" gradientUnits="userSpaceOnUse" x1="0" y1="22" x2="0" y2="2">
      <stop offset="0" stop-color={spinnerColor} />
      <stop offset="1" stop-color={spinnerColor} stop-opacity="0" />
    </linearGradient>
    <g>
      <animateTransform
        attributeName="transform"
        attributeType="XML"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="1s"
        repeatCount="indefinite"
      />
      <path
        d="M12,22.5C6.2,22.5,1.5,17.8,1.5,12C1.5,6.2,6.2,1.5,12,1.5v-1C5.6,0.5,0.5,5.6,0.5,12c0,6.4,5.1,11.5,11.5,11.5V22.5z"
        fill={spinnerColor}
      />
      <path
        d="M12,0.5v1c5.8,0,10.5,4.7,10.5,10.5c0,5.8-4.7,10.5-10.5,10.5v1c6.4,0,11.5-5.1,11.5-11.5C23.5,5.6,18.4,0.5,12,0.5z"
        fill="url(#a)"
      />
    </g>
  </svg>
</div>

<style lang="scss">
  .spinner {
    &-inline {
      width: 0.75rem;
      height: 0.75rem;
    }
    &-small {
      width: 1rem;
      height: 1rem;
    }
    &-medium {
      width: 1.5rem;
      height: 1.5rem;
    }
    &-large {
      width: 2rem;
      height: 2rem;
    }
    &-x-large {
      width: 3rem;
      height: 3rem;
    }
  }
</style>
