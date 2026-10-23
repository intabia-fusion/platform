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
  // Window frame of the catalog and the canvas: title bar over the product work area background
  export let title: string
  // Fixed content size, as a screen frame has; both omitted: the frame wraps its content
  export let width: number | undefined = undefined
  export let height: number | undefined = undefined
  // Fill the parent, for a screen story that takes the whole preview
  export let fill: boolean = false
</script>

<div class="kit-frame" class:fill style:width={width !== undefined ? `${width}px` : undefined}>
  <div class="bar">
    <span class="dots"><i /><i /><i /></span>
    <span class="title">{title}</span>
  </div>
  <div
    class="body"
    class:fixed={width !== undefined || fill}
    style:height={height !== undefined ? `${height}px` : undefined}
  >
    <slot />
  </div>
</div>

<style lang="scss">
  .kit-frame {
    display: inline-flex;
    flex-direction: column;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    background-color: var(--theme-bg-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    box-shadow: var(--popup-shadow);
  }
  .fill {
    display: flex;
    width: 100%;
    height: 100%;

    .body {
      flex: 1;
      min-height: 0;
    }
  }
  .bar {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.75rem;
    height: 2rem;
    padding: 0 0.75rem;
    background-color: var(--theme-statusbar-color);
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .dots {
    display: flex;
    gap: 0.375rem;

    i {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background-color: var(--theme-divider-color);
    }
  }
  .title {
    position: absolute;
    left: 5rem;
    right: 5rem;
    text-align: center;
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--theme-dark-color);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .body {
    position: relative;
    box-sizing: border-box;
    padding: 1.5rem;

    &.fixed {
      padding: 0;
      overflow: hidden;
    }
  }
</style>
