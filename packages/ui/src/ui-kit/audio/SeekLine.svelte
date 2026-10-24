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
  import { createEventDispatcher } from 'svelte'

  import { seekable } from './seek'

  export let progress: number = 0
  export let duration: number | undefined = undefined
  export let valueText: string | undefined = undefined

  const dispatch = createEventDispatcher<{ seek: number }>()
</script>

<!-- The line without a waveform: a file too large to decode, or one that failed to. -->
<span class="seek-line" use:seekable={{ progress, duration, valueText, onSeek: (to) => dispatch('seek', to) }}>
  <span class="fill" style:width={`${progress * 100}%`} />
</span>

<style lang="scss">
  .seek-line {
    position: relative;
    display: block;
    flex-grow: 1;
    width: 100%;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 0.125rem;
    background-color: color-mix(in srgb, var(--theme-caption-color) 16%, transparent);
    cursor: pointer;

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.25rem;
    }
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background-color: var(--theme-caption-color);
  }
</style>
