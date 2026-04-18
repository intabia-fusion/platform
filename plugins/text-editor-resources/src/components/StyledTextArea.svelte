<script lang="ts">
  import { Markup } from '@intabiafusion/core'
  import { IntlString } from '@intabiafusion/platform'
  import { EmptyMarkup } from '@intabiafusion/text'
  import textEditor from '@intabiafusion/text-editor'
  import { ButtonSize, Label } from '@intabiafusion/ui'
  import { createEventDispatcher } from 'svelte'

  import StyledTextEditor from './StyledTextEditor.svelte'

  export let label: IntlString | undefined = undefined
  export let content: Markup | undefined
  export let placeholder: IntlString = textEditor.string.EditorPlaceholder

  export let showButtons = true
  export let buttonSize: ButtonSize = 'small'
  export let focus = false
  export let kind: 'normal' | 'emphasized' | 'indented' = 'normal'
  export let isScrollable: boolean = false
  export let maxHeight: 'max' | 'card' | 'limited' | string | undefined = undefined
  export let required = false

  let rawValue: Markup
  let oldContent: Markup = EmptyMarkup

  $: if (content !== undefined && oldContent !== content) {
    oldContent = content
    rawValue = content
  }

  let editor: StyledTextEditor

  export function submit (): void {
    editor.submit()
  }
  export function isEditable (): boolean {
    return editor.isEditable()
  }
  export function setEditable (editable: boolean): void {
    editor.setEditable(editable)
  }
  const dispatch = createEventDispatcher()

  let needFocus = focus

  $: if (editor !== undefined && needFocus) {
    editor.focus()
    needFocus = false
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="antiComponent styled-box focusable clear-mins"
  class:antiEmphasized={kind === 'emphasized'}
  class:antiIndented={kind === 'indented'}
  on:click={() => {
    editor?.focus()
  }}
>
  {#if label}
    <div>
      <span class="label"><Label {label} /></span>
      {#if required}<span class="error-color">&ast;</span>{/if}
    </div>
  {/if}
  <StyledTextEditor
    {placeholder}
    {showButtons}
    {buttonSize}
    {maxHeight}
    {isScrollable}
    bind:content={rawValue}
    bind:this={editor}
    on:blur={() => {
      dispatch('value', rawValue)
      content = rawValue
    }}
    on:value={(evt) => {
      rawValue = evt.detail
      dispatch('changeContent', rawValue)
    }}
  >
    <slot />
  </StyledTextEditor>
</div>

<style lang="scss">
  .styled-box {
    flex-grow: 1;

    .label {
      padding-bottom: 0.25rem;
      font-size: 0.75rem;
      color: var(--caption-color);
      opacity: 0.3;
      transition: top 200ms;
      pointer-events: none;
      user-select: none;
    }
  }
</style>
