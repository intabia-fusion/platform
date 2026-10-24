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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher, onMount, tick } from 'svelte'

  import ui from '../../plugin'
  import type { CodeInputEvents, CodeInputProps, CodeInputSize } from './types'

  type $$Props = CodeInputProps
  type $$Events = CodeInputEvents

  export let value: string | undefined = undefined
  export let length: number = 6
  export let size: CodeInputSize | undefined = undefined
  export let numeric: boolean = true
  export let separator: boolean = true
  export let disabled: boolean = false
  export let error: boolean = false
  export let autofocus: boolean = false

  const dispatch = createEventDispatcher<{ input: string, complete: string }>()

  const inputs: HTMLInputElement[] = []
  let cells: string[] = split(value, length)
  const cellNames: string[] = []

  $: resolvedSize = size ?? 'small'
  $: translateCellNames($languageStore, length)
  $: half = separator && length % 2 === 0 ? length / 2 : -1
  // Only a value set by the place replaces the cells; the cells' own value already matches them.
  $: if ((value ?? '') !== cells.join('') || cells.length !== length) cells = split(value, length)

  function accept (char: string): boolean {
    return numeric ? /^\d$/.test(char) : char.trim() !== ''
  }

  function translateCellNames (lang: string, count: number): void {
    for (let index = 0; index < count; index++) {
      translateCB(ui.string.CodeDigit, { index: index + 1, count }, lang === '' ? undefined : lang, (res) => {
        cellNames[index] = res
      })
    }
  }

  function split (text: string | undefined, count: number): string[] {
    const chars = [...(text ?? '')].filter(accept).slice(0, count)
    return Array.from({ length: count }, (_, i) => chars[i] ?? '')
  }

  function commit (): void {
    value = cells.join('')
    dispatch('input', value)
    if (cells.every((cell) => cell !== '')) dispatch('complete', value)
  }

  function focusCell (index: number): void {
    const input = inputs[Math.max(0, Math.min(length - 1, index))]
    input?.focus()
    input?.select()
  }

  // Fills cells from `index` on; returns the cell after the last one filled.
  function fill (index: number, chars: string[]): number {
    let at = index
    for (const char of chars) {
      if (at >= length) break
      cells[at++] = char
    }
    cells = cells
    return at
  }

  async function handleInput (index: number, event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const typed = [...input.value]
    const chars = typed.filter(accept)
    const previous = cells[index]
    let next = index
    if (typed.length > 0 && (chars.length === 0 || (typed.length > 1 && chars.length === 1 && chars[0] === previous))) {
      // Only a rejected character was typed: the cell keeps its own and the focus stays.
      input.value = previous
      return
    }
    if (chars.length === 0) {
      cells[index] = ''
      cells = cells
    } else if (chars.length === 2 && previous !== '' && chars[0] === previous) {
      // Typed after the existing character: the new one replaces it.
      cells[index] = chars[1]
      cells = cells
      next = index + 1
    } else {
      // One typed character, or a whole code from autofill.
      next = fill(index, chars)
    }
    input.value = cells[index]
    commit()
    await tick()
    if (chars.length > 0) focusCell(next)
  }

  function handleKeydown (index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'Backspace':
        event.preventDefault()
        if (cells[index] !== '') {
          cells[index] = ''
        } else if (index > 0) {
          cells[index - 1] = ''
          focusCell(index - 1)
        }
        cells = cells
        commit()
        break
      case 'Delete':
        event.preventDefault()
        cells[index] = ''
        cells = cells
        commit()
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusCell(index - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        focusCell(index + 1)
        break
      case 'Home':
        event.preventDefault()
        focusCell(0)
        break
      case 'End':
        event.preventDefault()
        focusCell(length - 1)
        break
    }
  }

  async function handlePaste (index: number, event: ClipboardEvent): Promise<void> {
    event.preventDefault()
    const chars = [...(event.clipboardData?.getData('text') ?? '')].filter(accept)
    if (chars.length === 0) return
    // A whole code goes from the first cell, wherever it was pasted.
    const next = fill(chars.length >= length ? 0 : index, chars)
    commit()
    await tick()
    focusCell(next)
  }

  /** Focuses the first empty cell, or the last one when the code is complete. */
  export function focus (): void {
    const empty = cells.findIndex((cell) => cell === '')
    focusCell(empty === -1 ? length - 1 : empty)
  }

  /** Empties every cell and focuses the first one: a code that was rejected. */
  export function clear (): void {
    cells = split('', length)
    commit()
    focusCell(0)
  }

  onMount(() => {
    if (autofocus) focus()
  })
</script>

<div
  class="code-input code-input--{resolvedSize}"
  class:code-input--error={error}
  class:code-input--disabled={disabled}
  role="group"
  aria-label={$$props['aria-label']}
  aria-labelledby={$$props['aria-labelledby']}
  aria-describedby={$$props['aria-describedby']}
>
  {#each cells as cell, index}
    {#if index === half}
      <span class="code-input__separator" aria-hidden="true" />
    {/if}
    <input
      bind:this={inputs[index]}
      class="code-input__cell"
      type="text"
      value={cell}
      inputmode={numeric ? 'numeric' : 'text'}
      autocomplete={index === 0 ? 'one-time-code' : 'off'}
      autocapitalize="characters"
      spellcheck="false"
      aria-label={cellNames[index] ?? `${index + 1} / ${length}`}
      aria-invalid={error ? 'true' : undefined}
      {disabled}
      on:input={(event) => handleInput(index, event)}
      on:keydown={(event) => {
        handleKeydown(index, event)
      }}
      on:paste={(event) => handlePaste(index, event)}
      on:focus={(event) => {
        event.currentTarget.select()
      }}
    />
  {/each}
</div>

<style lang="scss">
  .code-input {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);

    &__cell {
      box-sizing: border-box;
      width: calc(var(--_height) * 0.75);
      height: var(--_height);
      margin: 0;
      padding: 0;
      border: none;
      border-radius: var(--_radius);
      outline: none;
      box-shadow: inset 0 0 0 1px var(--_border);
      background-color: var(--input-BackgroundColor);
      font-family: var(--font-family);
      font-size: var(--_font-size);
      font-weight: 500;
      line-height: var(--_line-height);
      font-variant-numeric: tabular-nums;
      text-align: center;
      text-transform: uppercase;
      color: var(--global-primary-TextColor);
      caret-color: var(--global-focus-BorderColor);
      appearance: none;

      &:not(:disabled):hover {
        background-color: var(--input-hover-BackgroundColor);
      }
      &:focus {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      // No outline, as on a disabled button: only an enabled field is a box to type into.
      &:disabled {
        box-shadow: none;
        background-color: var(--button-disabled-BackgroundColor);
        color: var(--button-disabled-LabelColor);
        cursor: not-allowed;
      }
    }
    &__separator {
      flex-shrink: 0;
      width: var(--spacing-1_5);
      height: 1px;
      background-color: var(--global-secondary-TextColor);
    }
    &--disabled &__separator {
      background-color: var(--button-disabled-LabelColor);
    }

    --_border: var(--input-BorderColor, transparent);
    &--error {
      --_border: var(--input-error-BorderColor);
    }

    // Sizes
    &--large {
      --_height: var(--global-large-Size);
      --_radius: var(--medium-BorderRadius);
      --_font-size: 1.5rem;
      --_line-height: 2rem;
    }
    &--medium {
      --_height: var(--global-medium-Size);
      --_radius: var(--medium-BorderRadius);
      --_font-size: 1.25rem;
      --_line-height: 1.75rem;
    }
    &--small {
      --_height: var(--global-small-Size);
      --_radius: var(--small-BorderRadius);
      --_font-size: 1rem;
      --_line-height: 1.5rem;
    }
  }
</style>
