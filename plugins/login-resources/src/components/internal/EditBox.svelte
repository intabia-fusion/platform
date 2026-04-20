<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License, this software is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { onMount, afterUpdate, createEventDispatcher } from 'svelte'
  import plugin from '../../plugin'
  import Label from '@hcengineering/ui/src/components/Label.svelte'
  import { resizeObserver } from '@hcengineering/ui'

  export let id: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let maxWidth: string = '100%'
  export let value: string | number | undefined = undefined
  export let placeholder: IntlString = plugin.string.EditBoxPlaceholder
  export let placeholderParam: any | undefined = undefined
  export let format: 'text' | 'password' | 'number' | 'text-multiline' = 'text'
  export let maxDigitsAfterPoint: number | undefined = undefined
  export let minValue: number | undefined = undefined
  export let maxValue: number | undefined = undefined
  export let formatter: ((v: string | number) => string | number) | undefined = undefined
  export let autoFocus: boolean = false
  export let select: boolean = false
  export let disabled: boolean = false
  export let fullSize: boolean = false
  export let required: boolean = false
  export let uppercase: boolean = false
  export let propagateClick: boolean = false
  export let shrink: boolean = false

  const dispatch = createEventDispatcher()

  let inputEl: HTMLInputElement | HTMLTextAreaElement | null = null
  let textMeasure: HTMLElement | null = null
  let phTranslate: string = ''

  $: translateCB(placeholder, placeholderParam ?? {}, $themeStore.language, (res) => {
    phTranslate = res
  })

  // handle number formatting bounds
  function setValue (val: number | string | undefined): void {
    if (typeof val !== 'number' || format !== 'number') return
    if (minValue !== undefined && maxValue !== undefined && maxValue < minValue) return
    if (minValue !== undefined && val < minValue) value = minValue
    if (maxValue !== undefined && val > maxValue) value = maxValue
    dispatch('value', value)
  }

  function computeSize (t: HTMLInputElement | EventTarget | null): void {
    if (!shrink || t == null) return
    const target = t as HTMLInputElement
    const v = target.value
    if (!textMeasure) return
    textMeasure.innerHTML = (v === '' ? phTranslate : String(v))
      .replaceAll(' ', '&nbsp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
    if (format === 'number') {
      target.style.width = maxWidth ?? '5rem'
    } else if (format === 'text-multiline') {
      // no dynamic width
    } else {
      target.style.width = Math.max(textMeasure.clientWidth, 50) + 'px'
    }
  }

  function handleInput (ev: Event): void {
    computeSize(ev.target)
    dispatch('input', { value })
    dispatch('value', value)
  }

  function handleChange (): void {
    if (format === 'number') setValue(Number(value))
    dispatch('change', { value })
  }

  onMount(() => {
    if (autoFocus && inputEl) {
      inputEl.focus()
      autoFocus = false
    }
    if (select && inputEl) {
      inputEl.select()
      select = false
    }
    computeSize(inputEl)
  })

  afterUpdate(() => {
    computeSize(inputEl)
  })

  export function focusInput (): void {
    inputEl?.focus()
  }
  export function selectInput (): void {
    inputEl?.select()
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="login-editbox {format} {disabled ? 'disabled' : ''} {fullSize ? 'full' : ''} {uppercase ? 'uppercase' : ''}"
  {id}
  use:resizeObserver={(el) => {}}
  style="width: {maxWidth};"
  on:mousedown|stopPropagation={() => {}}
  on:click={(event) => {
    if (!propagateClick) event.stopPropagation()
    inputEl?.focus()
  }}
>
  <div class="hidden-text" bind:this={textMeasure} />
  {#if label}
    <div class="mb-1 text-sm font-medium caption-color" class:required>
      <Label {label} />
    </div>
  {/if}

  <div class="input-wrapper">
    {#if format === 'text-multiline'}
      <textarea
        class="login-input"
        bind:this={inputEl}
        bind:value
        placeholder={phTranslate}
        rows={1}
        {disabled}
        on:input={handleInput}
        on:change={handleChange}
        on:blur={() => dispatch('blur', { value })}
      />
    {:else if format === 'password'}
      <input
        type="password"
        class="login-input"
        bind:this={inputEl}
        bind:value
        placeholder={phTranslate}
        {disabled}
        on:input={handleInput}
        on:change={handleChange}
        on:blur={() => dispatch('blur', { value })}
      />
    {:else if format === 'number'}
      <input
        type="number"
        class="login-input number"
        bind:this={inputEl}
        bind:value
        placeholder={phTranslate}
        {disabled}
        min={minValue}
        max={maxValue}
        on:input={handleInput}
        on:change={() => {
          setValue(Number(value))
          handleChange()
        }}
        on:blur={() => {
          setValue(Number(value))
          dispatch('blur', { value })
        }}
      />
    {:else}
      <input
        type="text"
        class="login-input"
        bind:this={inputEl}
        bind:value
        placeholder={phTranslate}
        {disabled}
        on:input={handleInput}
        on:change={handleChange}
        on:blur={() => dispatch('blur', { value })}
      />
    {/if}
  </div>
</div>

<style lang="scss">
  /* Localized EditBox for login-resources. Uses `--login-` prefixed color tokens so
     the login theme can exclusively control these visuals without touching global UI tokens. */
  .login-editbox {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    min-width: 3rem;
    height: 3.25rem;
    background-color: var(--login-input-bg, #f3e5f5);
    border: 1px solid var(--login-button-border, var(--theme-button-border));
    border-radius: 0.75rem;
    caret-color: var(--login-caret-color, var(--theme-caret-color));
    box-sizing: border-box;

    &.full {
      width: 100%;
    }

    &:focus-within {
      background-color: var(--login-button-focused, var(--theme-button-focused));
      border-color: var(--login-list-divider-color, var(--theme-list-divider-color));
    }

    .input-wrapper {
      display: flex;
      align-items: center;
    }

    .login-input {
      height: 3.25rem;
      margin: 0;
      padding: 0.875rem 1.25rem 0;
      background-color: transparent;
      border: none;
      border-radius: 0.75rem;
      color: var(--login-input-text-color, var(--login-content-color, var(--theme-content-color)));
      width: 100%;
      box-sizing: border-box;

      &::placeholder {
        color: var(--login-placeholder-color, var(--login-caption-color, var(--theme-caption-color)));
        opacity: 1;
      }

      &.number {
        /* specific tweaks if required */
      }

      &:disabled {
        background-color: var(--login-button-pressed, var(--theme-button-pressed));
      }

      &.nolabel {
        padding-top: 0;
      }
    }

    .label {
      position: absolute;
      top: 1rem;
      left: 1.25rem;
      font-size: 0.75rem;
      color: var(--login-caption-color, var(--theme-caption-color));
      opacity: 0.8;
      transition: top 200ms;
      pointer-events: none;
      user-select: none;
    }

    input:focus + .label,
    input:not(:placeholder-shown) + .label {
      top: 0.5rem;
    }
  }

  .hidden-text {
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    pointer-events: none;
    font-size: 0.95rem;
  }

  .error {
    border: 1px solid var(--system-error-60-color);
    &:focus-within {
      border-color: var(--system-error-color);
    }
  }

  /* small responsive tweak */
  @media (max-width: 480px) {
    .login-editbox {
      height: 3rem;
    }
    .login-input {
      padding: 0.75rem 1rem;
    }
  }
</style>
