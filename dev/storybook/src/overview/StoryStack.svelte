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
  import { onMount } from 'svelte'

  import type { StackGroup } from './stack'

  export let intro: string
  export let groups: StackGroup[]

  let root: HTMLElement

  // The preview scrolls its body, not the window
  function scroller (): HTMLElement {
    for (let el = root.parentElement; el != null; el = el.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) return el
    }
    return document.scrollingElement as HTMLElement
  }

  // scrollIntoView would also scroll the manager page around the iframe, out of the reader's reach
  function scrollToElement (el: HTMLElement | null): void {
    if (el == null) return
    const box = scroller()
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top
  }

  // Stacked stories scroll a selected row or a focused field into view as they load: the overview opens at the top
  // until the reader scrolls themselves.
  onMount(() => {
    const events = ['wheel', 'touchmove', 'keydown', 'pointerdown']
    const box = scroller()
    // A slow first load mounts stories after any fixed delay, so every scroll is undone until the reader acts
    const reset = (): void => {
      if (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) {
        document.activeElement.blur()
      }
      if (box.scrollTop !== 0) box.scrollTop = 0
    }
    const stop = (): void => {
      window.removeEventListener('scroll', reset, true)
      window.removeEventListener('focusin', reset)
      events.forEach((name) => {
        window.removeEventListener(name, stop)
      })
    }
    reset()
    // Capture: a scroll of an element does not bubble
    window.addEventListener('scroll', reset, { capture: true, passive: true })
    window.addEventListener('focusin', reset)
    events.forEach((name) => {
      window.addEventListener(name, stop, { passive: true })
    })
    return stop
  })
</script>

<div class="stack" bind:this={root}>
  <p class="stack__intro">{intro}</p>
  <nav class="stack__toc" aria-label="Contents">
    {#each groups as group}
      <div class="stack__toc-group">
        <span class="stack__toc-title">{group.title}</span>
        {#each group.entries as item}
          <a
            class="stack__toc-link"
            href={`#${item.href}`}
            on:click|preventDefault={() => {
              scrollToElement(document.getElementById(item.href))
            }}
          >
            {item.title}
          </a>
        {/each}
      </div>
    {/each}
  </nav>
  {#each groups as group}
    <section class="stack__group">
      <h2 class="stack__group-title">{group.title}</h2>
      {#each group.entries as item}
        <article class="stack__entry" id={item.href}>
          <header class="stack__entry-header">
            <!-- The page is in the preview iframe: the story's own page opens in the whole Storybook. -->
            <a class="stack__entry-title" href={item.href} target="_top">{item.title}</a>
            {#if item.note !== undefined}<span class="stack__entry-note">{item.note}</span>{/if}
          </header>
          <svelte:component this={item.Component} {...item.props} />
        </article>
      {/each}
    </section>
  {/each}
</div>

<style lang="scss">
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    color: var(--global-primary-TextColor);

    &__intro {
      margin: 0;
      max-width: 60rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-secondary-TextColor);
    }
    &__toc {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1) var(--spacing-4);
      padding: var(--spacing-2);
      background-color: var(--theme-panel-color);
      border: 1px solid var(--theme-divider-color);
      border-radius: var(--medium-BorderRadius);
    }
    &__toc-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-0_5);
      min-width: 10rem;
    }
    &__toc-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--global-secondary-TextColor);
    }
    &__toc-link {
      font-size: 0.8125rem;
      color: var(--global-primary-TextColor);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    &__group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    &__group-title {
      margin: 0;
      padding-bottom: var(--spacing-1);
      font-size: 1.125rem;
      font-weight: 600;
      border-bottom: 1px solid var(--theme-divider-color);
    }
    &__entry {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1_5);
      scroll-margin-top: var(--spacing-2);
    }
    &__entry-header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--spacing-1);
    }
    &__entry-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--global-primary-TextColor);
      text-decoration: none;

      &:hover {
        color: var(--global-primary-LinkColor);
        text-decoration: underline;
      }
    }
    &__entry-note {
      font-size: 0.8125rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
