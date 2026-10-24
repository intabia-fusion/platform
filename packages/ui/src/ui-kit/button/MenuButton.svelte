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
<script
  lang="ts"
  generics="Id extends DropdownIntlItem['id'] = DropdownIntlItem['id'], Selected extends Id | Id[] = Id"
>
  import { deepEqual } from 'fast-equals'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import ModernPopup from '../../components/ModernPopup.svelte'
  import { showPopup, type PopupResult } from '../../popups'
  import { closeTooltip } from '../../tooltips'
  import type { DropdownIntlItem } from '../../types'
  import Button from './Button.svelte'
  import type { MenuButtonEvents, MenuButtonProps } from './types'

  type $$Props = MenuButtonProps<Id, Selected>
  type $$Events = MenuButtonEvents<Selected>

  export let items: Array<DropdownIntlItem<Id>>
  export let selected: Selected | undefined = undefined
  export let multiselect: boolean = false
  export let noSelection: boolean = false
  export let autoSelectSingle: boolean = false
  export let itemParams: Record<string, any> = {}
  export let element: HTMLButtonElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }

  const dispatch = createEventDispatcher<{ selected: Selected }>()

  let popup: PopupResult | undefined

  // ModernPopup toggles items only on an array.
  $: shownSelected = multiselect
    ? Array.isArray(selected)
      ? selected
      : selected !== undefined
        ? [selected]
        : []
    : selected
  $: popupProps = { items, selected: noSelection ? undefined : shownSelected, multiselect, params: itemParams }
  $: syncPopup(popupProps)

  let shownProps: typeof popupProps | undefined

  // popupProps is the only dependency: no echo right after opening, no re-render for an equal inline items literal.
  function syncPopup (props: typeof popupProps): void {
    if (popup === undefined || deepEqual(props, shownProps)) return
    shownProps = props
    popup.update(props)
  }

  // `multiselect` decides the shape; `Selected` only follows it for the caller's types.
  function select (value: Id | Id[]): void {
    selected = value as Selected
    dispatch('selected', value as Selected)
  }

  function open (): void {
    if (popup !== undefined) return
    if (autoSelectSingle && !multiselect && items.length === 1) {
      select(items[0].id)
      return
    }
    closeTooltip()
    shownProps = popupProps
    popup = showPopup(
      ModernPopup,
      popupProps,
      element,
      (result: Id | undefined) => {
        popup = undefined
        if (!multiselect && result !== undefined) select(result)
      },
      (result: Id[] | undefined) => {
        if (multiselect && Array.isArray(result)) select(result)
      }
    )
  }

  onDestroy(() => {
    popup?.close()
  })
</script>

<!-- Two branches: passing <slot /> down would always count as content and break icon-only.
     hasMenu and pressed follow the spread: the popup state belongs to this component. -->
{#if $$slots.default}
  <Button
    bind:element
    {...$$restProps}
    hasMenu
    pressed={popup !== undefined}
    on:click={open}
    on:click
    on:keydown
    on:focus
    on:blur
  >
    <slot />
  </Button>
{:else}
  <Button
    bind:element
    {...$$restProps}
    hasMenu
    pressed={popup !== undefined}
    on:click={open}
    on:click
    on:keydown
    on:focus
    on:blur
  />
{/if}
