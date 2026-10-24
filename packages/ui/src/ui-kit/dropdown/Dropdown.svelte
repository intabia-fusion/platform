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
<script lang="ts" generics="Id extends DropdownItemId = DropdownItemId, Selected extends Id | Id[] = Id">
  import type { IntlString } from '@hcengineering/platform'
  import { deepEqual } from 'fast-equals'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import ModernPopup from '../../components/ModernPopup.svelte'
  import { showPopup, type PopupResult } from '../../popups'
  import { closeTooltip } from '../../tooltips'
  import type { DropdownIntlItem, IconComponent, IconSize } from '../../types'
  import SelectButton from '../select-button/SelectButton.svelte'
  import type { SelectButtonChevron } from '../select-button/types'
  import type {
    DropdownEvents,
    DropdownItem,
    DropdownItemId,
    DropdownProps,
    DropdownSeparator,
    DropdownSlots
  } from './types'

  type $$Props = DropdownProps<Id, Selected>
  type $$Events = DropdownEvents<Selected>
  type $$Slots = DropdownSlots<Id>

  export let items: Array<DropdownItem<Id>>
  export let selected: Selected | undefined = undefined
  export let multiselect: boolean = false
  export let separator: DropdownSeparator = 'dot'
  export let placeholder: IntlString | undefined = undefined
  export let icon: IconComponent | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let itemParams: Record<string, any> = {}
  export let chevron: SelectButtonChevron = true
  export let withSearch: boolean = false
  export let autoSelect: boolean = false
  export let allowDeselect: boolean | undefined = undefined
  export let wrap: boolean = false
  export let popupWidth: 'wide' | 'x-wide' | undefined = undefined
  export let disabled: boolean = false
  export let element: HTMLButtonElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }

  const dispatch = createEventDispatcher<{ selected: Selected, deselected: null }>()

  let popup: PopupResult | undefined
  let autoSelectDone = false

  $: deselectable = allowDeselect ?? multiselect

  // Assigned inline so the compiler orders it before the values derived from `selected`.
  $: if (autoSelect && !autoSelectDone && items.length > 0) {
    if (selected === undefined) {
      selected = (multiselect ? [items[0].id] : items[0].id) as Selected
      dispatch('selected', selected)
    }
    // A choice the user cleared stays cleared: with deselect allowed, the first item is picked only once.
    autoSelectDone = deselectable
  }

  $: selectedIds = (Array.isArray(selected) ? selected : selected !== undefined ? [selected] : []) as Id[]
  // A chosen item may sit in a submenu.
  $: chosen = flatten(items).filter((it) => selectedIds.includes(it.id))
  $: single = multiselect ? undefined : chosen[0]

  // ModernPopup toggles items only on an array.
  $: popupProps = {
    items: items.map(toPopupItem),
    selected: multiselect ? selectedIds : selected,
    multiselect,
    withSearch,
    params: itemParams,
    popupClass: popupWidth ?? 'fit'
  }
  $: syncPopup(popupProps)

  let shownProps: typeof popupProps | undefined

  function syncPopup (props: typeof popupProps): void {
    if (popup === undefined || deepEqual(props, shownProps)) return
    shownProps = props
    popup.update(props)
  }

  function toPopupItem (item: DropdownItem<Id>): DropdownIntlItem<Id> {
    return {
      id: item.id,
      label: item.label,
      params: item.labelParams,
      icon: item.icon,
      iconProps: item.iconProps,
      description: item.description,
      paramsDescription: item.descriptionParams,
      exclusive: item.exclusive,
      separatorBefore: item.divider,
      separatorLabel: item.heading,
      component: item.component,
      componentProps: item.componentProps,
      children: item.children?.map(toPopupItem)
    }
  }

  function flatten (list: Array<DropdownItem<Id>>): Array<DropdownItem<Id>> {
    return list.flatMap((item) => [item, ...flatten(item.children ?? [])])
  }

  // `multiselect` decides the shape; `Selected` only follows it for the caller's types.
  function select (value: Id | Id[]): void {
    selected = value as Selected
    dispatch('selected', value as Selected)
  }

  function deselect (): void {
    selected = undefined
    dispatch('deselected', null)
  }

  // A fit list is at least as wide as the trigger, but a wide trigger does not stretch a list of short items.
  function popupMinWidth (): string | undefined {
    if (element === undefined) return undefined
    return popupWidth === undefined ? `clamp(10rem, ${element.offsetWidth}px, 16.5rem)` : `${element.offsetWidth}px`
  }

  // Opened from the keyboard: the first row takes the focus, and it comes back to the trigger on close.
  function open (fromKeyboard: boolean): void {
    if (popup !== undefined || disabled) return
    closeTooltip()
    shownProps = popupProps
    popup = showPopup(
      ModernPopup,
      { ...popupProps, minWidth: popupMinWidth(), focusFirst: fromKeyboard && !withSearch },
      element,
      (result: Id | undefined) => {
        popup = undefined
        if (fromKeyboard) element?.focus()
        if (multiselect || result === undefined) return
        if (deselectable && result === selected) deselect()
        else select(result)
      },
      (result: Id[] | undefined) => {
        if (!multiselect || !Array.isArray(result)) return
        // The list has unchecked the last item on its own: put the choice back.
        if (result.length === 0 && !deselectable) popup?.update({ ...popupProps })
        else select(result)
      }
    )
  }

  // Arrows open the list, as on a native select; the list then takes the keyboard.
  function handleKeydown (event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    open(true)
  }

  // A click from Enter or Space has no pointer position: `detail` is 0.
  function handleClick (event: MouseEvent): void {
    open(event.detail === 0)
  }

  onDestroy(() => {
    popup?.close()
  })
</script>

<!-- Separate branches: a passed slot always counts as content and would hide the label of a single choice. -->
{#if $$slots.value}
  <SelectButton
    bind:element
    {...$$restProps}
    {icon}
    {iconSize}
    {iconProps}
    {placeholder}
    {chevron}
    {disabled}
    {wrap}
    empty={chosen.length === 0}
    pressed={popup !== undefined}
    on:click={handleClick}
    on:keydown={handleKeydown}
  >
    <slot name="value" items={chosen} />
  </SelectButton>
{:else if multiselect}
  <SelectButton
    bind:element
    {...$$restProps}
    {icon}
    {iconSize}
    {iconProps}
    {placeholder}
    {chevron}
    {disabled}
    {wrap}
    empty={chosen.length === 0}
    pressed={popup !== undefined}
    on:click={handleClick}
    on:keydown={handleKeydown}
  >
    <!-- No whitespace between the values: the separators set the spacing. -->
    <span class="dropdown__values dropdown__values--{separator}" class:dropdown__values--wrap={wrap}
      >{#each chosen as item (item.id)}<span class="dropdown__value"
          >{#if item.icon !== undefined}<span class="dropdown__icon"
              ><Icon icon={item.icon} iconProps={item.iconProps} size="small" /></span
            >{/if}<Label label={item.label} params={item.labelParams ?? itemParams} /></span
        >{/each}</span
    >
  </SelectButton>
{:else}
  <SelectButton
    bind:element
    {...$$restProps}
    icon={single?.icon ?? icon}
    {iconSize}
    iconProps={single?.icon !== undefined ? (single.iconProps ?? {}) : iconProps}
    label={single?.label}
    labelParams={single?.labelParams ?? itemParams}
    {placeholder}
    {chevron}
    {disabled}
    {wrap}
    pressed={popup !== undefined}
    on:click={handleClick}
    on:keydown={handleKeydown}
  />
{/if}

<style lang="scss">
  // Inline, so the whole list gets one ellipsis; the separator is drawn before every value but the first.
  .dropdown__values {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dropdown__value + .dropdown__value {
    margin-left: var(--spacing-0_75);
  }
  // Breaks between the values, never inside one.
  .dropdown__values--wrap {
    white-space: normal;

    .dropdown__value {
      white-space: nowrap;
    }
  }
  .dropdown__values--none .dropdown__value + .dropdown__value {
    margin-left: var(--spacing-1);
  }
  .dropdown__values--comma .dropdown__value:not(:last-child)::after {
    content: ',';
  }
  .dropdown__values--comma .dropdown__value + .dropdown__value {
    margin-left: 0.25em;
  }
  // The button's own text color, so it reads on every kind.
  .dropdown__values--dot .dropdown__value + .dropdown__value::before {
    content: '';
    display: inline-block;
    width: 0.25rem;
    height: 0.25rem;
    margin-right: var(--spacing-0_75);
    vertical-align: middle;
    border-radius: 50%;
    background-color: currentColor;
    opacity: 0.5;
  }
  .dropdown__icon {
    display: inline-flex;
    margin-right: var(--spacing-0_5);
    vertical-align: middle;
    color: var(--_icon);
  }
</style>
