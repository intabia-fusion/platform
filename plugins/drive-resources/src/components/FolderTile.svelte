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
  import type { Folder } from '@hcengineering/drive'
  import { createEventDispatcher } from 'svelte'

  import FolderContents from './FolderContents.svelte'
  import FolderGlyph from './FolderGlyph.svelte'

  export let value: Folder
  export let active: boolean = false

  const dispatch = createEventDispatcher<{ open: undefined, contextmenu: MouseEvent }>()
</script>

<div
  class="folder-tile"
  class:hovered={active}
  role="button"
  tabindex="0"
  title={value.title}
  on:click|stopPropagation={() => dispatch('open')}
  on:keydown={(e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    dispatch('open')
  }}
  on:contextmenu={(e) => dispatch('contextmenu', e)}
>
  <FolderGlyph size="large" />
  <span class="info">
    <span class="name">{value.title}</span>
    <span class="meta"><FolderContents {value} /></span>
  </span>
</div>

<style lang="scss">
  .folder-tile {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    box-sizing: border-box;
    min-width: 0;
    min-height: 4rem;
    padding: 0.625rem 0.875rem 0.625rem 0.75rem;
    border: 1px solid var(--global-ui-BorderColor);
    border-radius: calc(var(--small-BorderRadius) + 0.375rem);
    background-color: var(--theme-panel-color);
    box-shadow: 0 0.0625rem 0.125rem color-mix(in srgb, var(--global-popover-ShadowColor) 50%, transparent);
    cursor: pointer;
    user-select: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }

    &:hover,
    &.hovered,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 30%, var(--global-ui-BorderColor));
      box-shadow: 0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 65%, transparent);
    }
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--theme-caption-color);
  }

  .meta {
    display: flex;
    gap: 0.25rem;
    min-height: 1rem;
    font-size: 0.75rem;
    color: var(--theme-darker-color);
    white-space: nowrap;
  }
</style>
