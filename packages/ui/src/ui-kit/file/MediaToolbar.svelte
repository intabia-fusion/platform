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
  /** Shown without hover, e.g. while a menu of the toolbar is open. */
  export let visible: boolean = false
  /** Off where a tap on the media already reaches the same actions. */
  export let showOnTouch: boolean = false
</script>

<div class="media-toolbar" class:visible class:touch={showOnTouch}>
  <slot />
</div>

<style lang="scss">
  .media-toolbar {
    position: absolute;
    top: 0.375rem;
    right: 0.375rem;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.125rem;
    border: 1px solid var(--theme-popup-divider);
    border-radius: calc(var(--small-BorderRadius) + 0.125rem);
    // A floating panel of the app, like a popup: the media under it may be any colour.
    background-color: var(--theme-popup-color);
    box-shadow: 0 0.25rem 0.75rem -0.25rem var(--global-popover-ShadowColor);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;

    &.visible,
    :global(:hover) > &,
    :global(:focus-within) > & {
      opacity: 1;
      pointer-events: auto;
    }
  }

  // No hover on a touch screen: the toolbar stays, or never shows, even on the hover a tap leaves behind.
  @media (hover: none) {
    .media-toolbar.touch {
      opacity: 1;
      pointer-events: auto;
    }

    .media-toolbar:not(.touch, .visible) {
      opacity: 0;
      pointer-events: none;
    }
  }
</style>
