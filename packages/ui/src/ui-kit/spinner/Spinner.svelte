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
<script lang="ts" context="module">
  let instances = 0
</script>

<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'

  import Label from '../../components/Label.svelte'
  import type { SpinnerKind, SpinnerProps, SpinnerSize } from './types'

  type $$Props = SpinnerProps

  export let size: SpinnerSize | undefined = undefined
  export let kind: SpinnerKind | undefined = undefined
  export let inheritColor: boolean = false
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}

  // A shared id would paint every spinner on the page with the first one's gradient.
  const gradientId = `kit-spinner-gradient-${++instances}`

  $: named =
    label !== undefined || $$restProps['aria-label'] !== undefined || $$restProps['aria-labelledby'] !== undefined
</script>

<span
  class="spinner spinner--{size ?? 'medium'} spinner--{kind ?? 'neutral'}"
  class:spinner--inherit={inheritColor}
  role={named ? 'status' : undefined}
  aria-hidden={named ? undefined : 'true'}
  {...$$restProps}
>
  <svg class="spinner__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="22" x2="0" y2="2">
      <stop offset="0" stop-color="currentColor" />
      <stop offset="1" stop-color="currentColor" stop-opacity="0" />
    </linearGradient>
    <path
      d="M12,22.5C6.2,22.5,1.5,17.8,1.5,12C1.5,6.2,6.2,1.5,12,1.5v-1C5.6,0.5,0.5,5.6,0.5,12c0,6.4,5.1,11.5,11.5,11.5V22.5z"
      fill="currentColor"
    />
    <path
      d="M12,0.5v1c5.8,0,10.5,4.7,10.5,10.5c0,5.8-4.7,10.5-10.5,10.5v1c6.4,0,11.5-5.1,11.5-11.5C23.5,5.6,18.4,0.5,12,0.5z"
      fill="url(#{gradientId})"
    />
  </svg>
  {#if label !== undefined}
    <span class="spinner__label"><Label {label} params={labelParams} /></span>
  {/if}
</span>

<style lang="scss">
  .spinner {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_75);
    min-width: 0;
    vertical-align: middle;

    &__icon {
      flex-shrink: 0;
      width: var(--_size);
      height: var(--_size);
      color: var(--_color);
      animation: rotate 1s linear infinite;
    }
    &__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--neutral {
      --_color: var(--global-primary-TextColor);
    }
    &--brand {
      --_color: var(--button-brand-BackgroundColor);
    }
    &--inherit {
      --_color: currentColor;
    }

    &--large {
      --_size: 2rem;
    }
    &--medium {
      --_size: 1.5rem;
    }
    &--small {
      --_size: 1rem;
    }
    &--extra-small {
      --_size: 0.75rem;
    }
  }

  @keyframes rotate {
    to {
      transform: rotate(360deg);
    }
  }
</style>
