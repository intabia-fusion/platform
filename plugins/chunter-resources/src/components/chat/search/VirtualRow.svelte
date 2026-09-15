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
  import { persistentLazyObserver, resizeObserver } from '@hcengineering/ui'

  export let estimatedHeight: number

  let element: HTMLElement | undefined
  let visible = false
  let height: number = estimatedHeight

  function onVisible (value: boolean): void {
    if (!value && element !== undefined) {
      const measured = element.getBoundingClientRect().height
      if (measured > 0) height = measured
    }
    visible = value
  }

  function onResize (el: Element): void {
    if (!visible) return
    const measured = el.getBoundingClientRect().height
    if (measured > 0) height = measured
  }
</script>

<div
  bind:this={element}
  use:persistentLazyObserver={onVisible}
  use:resizeObserver={onResize}
  style:min-height={visible ? null : `${height}px`}
>
  {#if visible}
    <slot />
  {/if}
</div>
