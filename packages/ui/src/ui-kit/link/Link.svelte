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
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import type { LinkEvents, LinkProps, LinkTruncate } from './types'

  type $$Props = LinkProps
  type $$Events = LinkEvents

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let href: string | undefined = undefined
  export let external: boolean = false
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let disabled: boolean = false
  export let truncate: LinkTruncate = 'end'

  // The tail kept whole by `middle`: a file name keeps its ending and extension.
  const TAIL = 12

  let text = ''
  let translation = 0
  $: if (truncate === 'middle') translateLabel(label, labelParams, $languageStore === '' ? undefined : $languageStore)
  $: [head, tail] = text.length > TAIL * 2 ? [text.slice(0, -TAIL), text.slice(-TAIL)] : [text, '']

  function translateLabel (label: IntlString, params: Record<string, any>, language: string | undefined): void {
    const request = ++translation
    translateCB(label, params, language, (result) => {
      // A slower answer for a previous label must not overwrite the current one.
      if (request === translation) text = result
    })
  }

  // A disabled anchor still gets clicks, unlike a disabled button: the place's handler must not run.
  function blockDisabled (event: MouseEvent): void {
    if (!disabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
</script>

{#if href !== undefined}
  <!-- A disabled link drops href: it stays in the text but is neither focusable nor followed. -->
  <a
    class="link link--anchor"
    class:link--disabled={disabled}
    href={disabled ? undefined : href}
    target={external ? '_blank' : undefined}
    rel={external ? 'noopener noreferrer' : undefined}
    role={disabled ? 'link' : undefined}
    aria-disabled={disabled ? 'true' : undefined}
    {...$$restProps}
    on:click={blockDisabled}
    on:click
  >
    {#if icon !== undefined}
      <span class="link__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
    {/if}
    {#if truncate === 'middle'}
      <span class="link__label link__label--middle"><span class="link__head">{head}</span>{tail}</span>
    {:else}
      <span class="link__label"><Label {label} params={labelParams} /></span>
    {/if}
  </a>
{:else}
  <button class="link" class:link--disabled={disabled} type="button" {disabled} {...$$restProps} on:click>
    {#if icon !== undefined}
      <span class="link__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
    {/if}
    {#if truncate === 'middle'}
      <span class="link__label link__label--middle"><span class="link__head">{head}</span>{tail}</span>
    {:else}
      <span class="link__label"><Label {label} params={labelParams} /></span>
    {/if}
  </button>
{/if}

<style lang="scss">
  .link {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-0_5);
    margin: 0;
    padding: 0;
    min-width: 0;
    font: inherit;
    text-align: start;
    text-decoration: none;
    // An action in gray read as part of the text around it; the underline on hover marks it as a link.
    color: var(--global-primary-TextColor);
    background: none;
    border: none;
    border-radius: var(--min-BorderRadius);
    cursor: pointer;

    &:hover {
      .link__label {
        text-decoration: underline;
      }
    }
    // In running text the color matches the text: an address keeps a faint underline to stay findable.
    &--anchor:not(.link--disabled) .link__label {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, currentColor 35%, transparent);
      text-underline-offset: 0.125rem;
    }
    &--anchor:not(.link--disabled):hover .link__label {
      text-decoration-color: currentColor;
    }
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }

    &__icon {
      display: inline-flex;
      flex-shrink: 0;
    }
    &__label {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;

      // The head takes the ellipsis, the tail stays whole: the cut lands in the middle.
      &--middle {
        display: inline-flex;
        text-overflow: clip;
      }
    }
    &__head {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &--disabled,
    &--disabled:hover {
      color: var(--global-disabled-TextColor);
      cursor: not-allowed;

      .link__label {
        text-decoration: none;
      }
    }
  }
</style>
