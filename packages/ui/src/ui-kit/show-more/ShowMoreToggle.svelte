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

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'

  export let open: boolean
  export let controls: string

  const dispatch = createEventDispatcher<{ toggle: undefined }>()

  // ShowMore often sits inside a clickable message: the click must not open it.
  function handleClick (event: MouseEvent): void {
    event.stopPropagation()
    dispatch('toggle')
  }
</script>

<button type="button" class="show-more-toggle" aria-expanded={open} aria-controls={controls} on:click={handleClick}>
  <Label label={open ? ui.string.ShowLess : ui.string.ShowMore} />
</button>

<style lang="scss">
  .show-more-toggle {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin: 0;
    padding: 0 var(--spacing-1_5);
    height: 1.75rem;
    font-family: var(--font-family);
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1rem;
    white-space: nowrap;
    color: var(--global-secondary-TextColor);
    background-color: var(--theme-popup-color);
    border: none;
    border-radius: 1.75rem;
    // A hairline keeps the pill apart from a dark panel, where the shadow is lost.
    box-shadow:
      0 0 0 1px var(--theme-divider-color),
      0 2px 8px color-mix(in srgb, var(--global-popover-ShadowColor) 60%, transparent);
    cursor: pointer;
    transition:
      color 0.15s,
      background-color 0.15s;

    &:hover {
      color: var(--global-primary-TextColor);
      background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, var(--theme-popup-color));
    }
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
  }
</style>
