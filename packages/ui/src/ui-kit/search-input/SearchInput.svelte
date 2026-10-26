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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import ui from '../../plugin'
  import Spinner from '../spinner/Spinner.svelte'
  import TextInput from '../text-input/TextInput.svelte'
  import type { SearchInputEvents, SearchInputKind, SearchInputProps, SearchInputSize } from './types'

  type $$Props = SearchInputProps
  type $$Events = SearchInputEvents

  export let value: string | undefined = undefined
  export let placeholder: IntlString | undefined = undefined
  export let placeholderParams: Record<string, any> | undefined = undefined
  export let kind: SearchInputKind | undefined = undefined
  export let size: SearchInputSize | undefined = undefined
  export let collapsed: boolean = false
  export let delay: number = 500
  export let fullWidth: boolean = false
  export let loading: boolean = false
  export let autofocus: boolean = false

  const dispatch = createEventDispatcher<{ change: string }>()

  let field: TextInput | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let query = value ?? ''
  let committed = value

  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'small'
  // Only a value set by the place replaces the query: our own commit must not undo typing that followed it.
  $: if (value !== committed) {
    clearTimeout(timer)
    committed = value
    query = value ?? ''
  }

  export function focus (): void {
    field?.focus()
  }

  function commit (text: string): void {
    clearTimeout(timer)
    committed = text
    value = text
    dispatch('change', text)
  }

  function handleInput (event: CustomEvent<string>): void {
    query = event.detail
    clearTimeout(timer)
    timer = setTimeout(() => {
      commit(query)
    }, delay)
  }

  // The field reports a commit on blur as well; only the clear button is reported at once, typing waits for `delay`.
  function handleChange (event: CustomEvent<string>): void {
    if (event.detail === '' && (committed ?? '') !== '') commit('')
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key === 'Enter') commit(query)
    // Escape clears a typed query and is spent on that: it must not also close the panel or popup around the field.
    else if (event.key === 'Escape' && query !== '') {
      event.preventDefault()
      query = ''
      commit('')
    }
  }

  onDestroy(() => {
    clearTimeout(timer)
  })
</script>

<!-- The text field draws the box; a ghost search is a subtle field with the inset. -->
<span
  class="search-input search-input--{resolvedKind} search-input--{resolvedSize}"
  class:search-input--collapsed={collapsed}
  class:search-input--filled={query !== ''}
  class:search-input--full-width={fullWidth}
>
  <TextInput
    bind:this={field}
    value={query}
    kind={resolvedKind === 'ghost' ? 'subtle' : 'secondary'}
    inset={resolvedKind === 'ghost'}
    size={resolvedSize}
    type="search"
    placeholder={placeholder ?? ui.string.Search}
    {placeholderParams}
    clearable
    {fullWidth}
    {autofocus}
    aria-label={$$restProps['aria-label']}
    aria-labelledby={$$restProps['aria-labelledby']}
    aria-describedby={$$restProps['aria-describedby']}
    on:input={handleInput}
    on:change={handleChange}
    on:keydown={handleKeydown}
    on:keydown
    on:focus
    on:blur
  >
    <span slot="before" class="search-input__icon">
      {#if loading}
        <Spinner size="small" inheritColor />
      {:else}
        <Icon icon={ui.icon.Search} size="small" />
      {/if}
    </span>
  </TextInput>
</span>

<style lang="scss">
  .search-input {
    display: inline-flex;
    flex-shrink: 0;
    min-width: 0;

    &__icon {
      display: flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      color: color-mix(in srgb, var(--global-secondary-TextColor) 70%, var(--global-primary-TextColor));
    }

    // Sizes the field does not share: a medium search keeps the side padding of a small one.
    &--medium :global(.text-input__field) {
      --_pad: var(--spacing-1_5);
    }

    // In a row with buttons it fills what is left instead of pushing them out.
    &--full-width {
      display: flex;
      flex-shrink: 1;
      width: 100%;
    }
    // A collapsed search takes the width of the place only when it opens: at rest it is a button where the place puts it.
    &--full-width.search-input--collapsed:not(:focus-within, .search-input--filled) {
      width: auto;
    }

    // Opened, the icon stays where the square button had it, so it does not jump on focus.
    &--collapsed :global(.text-input__field) {
      padding-left: calc((var(--_height) - 1rem) / 2);
    }
    // At rest it is a square search button; focus or a query opens the field.
    &--collapsed:not(:focus-within, .search-input--filled) :global(.text-input__field) {
      justify-content: center;
      gap: 0;
      width: var(--_height);
      padding: 0;
      cursor: pointer;
    }
    // At rest it is a button of the toolbar: the colours of the secondary buttons next to it.
    &--secondary.search-input--collapsed:not(:focus-within, .search-input--filled) {
      :global(.text-input__field) {
        --_border: var(--kit-button-secondary-BorderColor, transparent);
        --_bg: var(--kit-button-secondary-BackgroundColor);
      }
      :global(.text-input__field.text-input__field:hover) {
        --_bg: var(--kit-button-secondary-hover-BackgroundColor);
      }
      .search-input__icon {
        color: var(--kit-button-subtle-IconColor);
      }
    }
    &--collapsed:not(:focus-within, .search-input--filled) :global(.text-input__control) {
      flex: 0 0 0;
      width: 0;
    }
  }
</style>
