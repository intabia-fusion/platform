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
  import type { Asset, IntlString } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import ui, { Label } from '@hcengineering/ui'
  import { IconBox, IconButton } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  export let icon: Asset
  export let color: string | undefined = undefined
  export let title: string = ''
  export let placeholder: IntlString | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let error: IntlString | undefined = undefined

  const dispatch = createEventDispatcher<{ open: undefined, remove: undefined }>()

  function open (): void {
    dispatch('open')
  }
</script>

<!-- Siblings, not nested: a button inside a button is invalid. -->
<div class="tile">
  <button
    type="button"
    class="open"
    title={title !== '' ? title : undefined}
    on:click|stopPropagation={open}
  >
    <span class="thumb"><IconBox {icon} {color} size="large" iconSize="large" /></span>
    <span class="info">
      <span class="name">
        {#if title !== ''}{title}{:else if placeholder != null}<Label label={placeholder} />{/if}
      </span>
      {#if error != null}
        <span class="meta failed"><Label label={error} /></span>
      {:else if label != null}
        <span class="meta"><Label {label} /></span>
      {/if}
    </span>
  </button>
  <span class="remove">
    <IconButton
      icon={ui.icon.Cross}
      kind="ghost"
      size="extra-small"
      iconSize="x-small"
      tooltip={{ label: presentation.string.Remove }}
      on:click={() => dispatch('remove')}
    />
  </span>
</div>

<style lang="scss">
  // Mirrors FileTile (ui-kit/file/_surface.scss): drafts share the strip with files.
  .tile {
    --card-pad: 0.375rem;
    --tile-size: 4rem;

    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.5rem;
    box-sizing: border-box;
    width: 18rem;
    max-width: 100%;
    height: var(--tile-size);
    padding: var(--card-pad) 1.75rem var(--card-pad) var(--card-pad);
    border: 1px solid var(--global-ui-BorderColor);
    border-radius: calc(var(--small-BorderRadius) + var(--card-pad));
    background-color: var(--theme-panel-color);
    box-shadow: 0 0.0625rem 0.125rem color-mix(in srgb, var(--global-popover-ShadowColor) 50%, transparent);
    cursor: pointer;
    user-select: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;

    &:hover,
    &:focus-within {
      border-color: color-mix(in srgb, var(--theme-caption-color) 6%, var(--global-ui-BorderColor));
      box-shadow:
        0 0.0625rem 0.125rem color-mix(in srgb, var(--global-popover-ShadowColor) 40%, transparent),
        0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 30%, transparent);

      .remove {
        opacity: 1;
      }
    }
    &:has(> .open:focus-visible) {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
  }

  // The focus ring is drawn on the card.
  .open {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    flex: 1;
    gap: 0.5rem;
    min-width: 0;
    align-self: stretch;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: none;
    }
  }

  // The size of a file thumbnail; the plate is the nearest kit size.
  .thumb {
    display: flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    width: calc(var(--tile-size) - 2 * var(--card-pad) - 2px);
    height: calc(var(--tile-size) - 2 * var(--card-pad) - 2px);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--theme-caption-color);
  }

  .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }

  .failed {
    color: var(--global-error-TextColor);
  }

  .remove {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    display: flex;
    opacity: 0;
    transition: opacity 0.15s ease;

    &:focus-within {
      opacity: 1;
    }
  }

  // No hover on touch screens: the cross stays.
  @media (hover: none) {
    .remove {
      opacity: 1;
    }
  }
</style>
