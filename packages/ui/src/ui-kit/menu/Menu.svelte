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
<script lang="ts" generics="Id extends MenuItemId = MenuItemId">
  import { getEmbeddedLabel, translate, type IntlString } from '@hcengineering/platform'
  import { languageStore, themeStore } from '@hcengineering/theme'
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'

  import { getPlatformColorDef } from '../../colors'
  import Icon from '../../components/Icon.svelte'
  import IconArrowUpRight from '../../components/icons/ArrowUpRight.svelte'
  import IconCheck from '../../components/icons/Check.svelte'
  import IconChevronRight from '../../components/icons/ChevronRight.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import { closePopup, showPopup, type PopupResult } from '../../popups'
  import { resizeObserver } from '../../resize'
  import SearchInput from '../search-input/SearchInput.svelte'
  import Spinner from '../spinner/Spinner.svelte'
  import Menu from './Menu.svelte'
  import type { MenuEvents, MenuHeadings, MenuItem, MenuItemId, MenuProps, MenuSlots, MenuWidth } from './types'

  type $$Props = MenuProps<Id>
  type $$Events = MenuEvents<Id>
  type $$Slots = MenuSlots

  export let items: Array<MenuItem<Id>>
  export let selected: Id | Id[] | undefined = undefined
  export let multiselect: boolean = false
  export let withSearch: boolean = false
  export let headings: MenuHeadings = 'lines'
  export let search: string = ''
  export let searchPlaceholder: IntlString = ui.string.SearchDots
  export let width: MenuWidth = 'fit'
  export let minWidth: string | undefined = undefined
  export let embedded: boolean = false
  export let loading: boolean = false
  export let autofocus: boolean = true
  export let onSelect: ((id: Id) => void) | undefined = undefined
  export let onToggle: ((id: Id) => void) | undefined = undefined
  export let onBack: (() => void) | undefined = undefined
  // Set by the parent menu on its submenu: a `popup` row result goes to the root.
  export let onResult: ((id: Id, result: unknown, close: boolean) => void) | undefined = undefined

  const dispatch = createEventDispatcher<{
    close: Id | null
    update: Id[]
    submenu: { id: Id, result: unknown }
    changeContent: null
  }>()

  interface Row {
    item: MenuItem<Id>
    // Parents of a search match, in its second line.
    path?: string
  }

  let list: HTMLElement | undefined
  let searchField: SearchInput | undefined
  let titles: Record<string, string> = {}
  let chosen: Id | undefined
  // Highlighted by `onKeydown` while the focus stays outside, in an editor.
  let active = -1
  // The row that took the focus last: the Tab stop of an embedded menu.
  let lastFocused = -1

  $: selectedIds = (Array.isArray(selected) ? selected : selected !== undefined ? [selected] : []) as Id[]
  $: role = multiselect ? 'menuitemcheckbox' : selected !== undefined ? 'menuitemradio' : 'menuitem'
  $: query = search.trim().toLowerCase()
  $: if (withSearch || query !== '') void fillTitles(items, $languageStore)
  // Split so that the titles arriving after mount do not rebuild every row of an unfiltered menu.
  $: plainRows = items.map((item) => ({ item }))
  $: searchRows = query === '' ? undefined : found(items, query, titles)
  let rows: Row[] = []
  $: rows = searchRows ?? plainRows
  $: withIcons = rows.some(({ item }) => item.icon !== undefined || item.color !== undefined)
  // Every row of a choice keeps the check column, so a fit-width menu does not put the check against the text.
  $: withChecks = role !== 'menuitem'
  // Checks and submenu arrows keep columns of their own, so checks line up whether a row has an arrow or not.
  $: withArrows = rows.some(({ item }) => hasSubmenu(item) || opensPage(item))
  $: if (active >= rows.length) active = rows.length - 1
  // An embedded list without a field would have no Tab stop, as every row is reached by arrows.
  $: tabStop =
    embedded && !withSearch
      ? lastFocused >= 0 && lastFocused < rows.length
        ? lastFocused
        : Math.max(
            0,
            rows.findIndex(({ item }) => isChecked(selectedIds, item))
          )
      : -1

  function flatten (
    list: Array<MenuItem<Id>>,
    parents: Array<MenuItem<Id>> = []
  ): Array<[MenuItem<Id>, Array<MenuItem<Id>>]> {
    return list.flatMap((item) => [
      [item, parents] as [MenuItem<Id>, Array<MenuItem<Id>>],
      ...flatten(item.children ?? [], [...parents, item])
    ])
  }

  let titlesRequest = 0

  async function fillTitles (list: Array<MenuItem<Id>>, lang: string): Promise<void> {
    const request = ++titlesRequest
    const all = flatten(list)
    const names = await Promise.all(
      all.map(async ([item]) => await translate(item.label, item.labelParams ?? {}, lang === '' ? undefined : lang))
    )
    // A slower answer for the previous items or language must not overwrite the current one.
    if (request !== titlesRequest) return
    const result: Record<string, string> = {}
    all.forEach(([item], i) => {
      result[String(item.id)] = names[i]
    })
    titles = result
  }

  // One flat copy per item, so a keystroke does not hand every row a new object.
  const flatCopies = new WeakMap<MenuItem<Id>, MenuItem<Id>>()

  function flatCopy (item: MenuItem<Id>): MenuItem<Id> {
    let copy = flatCopies.get(item)
    if (copy === undefined) {
      copy = { ...item, children: undefined, divider: undefined, heading: undefined }
      flatCopies.set(item, copy)
    }
    return copy
  }

  // While searching the list is flat: matches from every level, their parents in the second line.
  function found (list: Array<MenuItem<Id>>, text: string, names: Record<string, string>): Row[] {
    return flatten(list)
      .filter(([item]) => !(item.submenuOnly === true && item.popup === undefined))
      .filter(([item]) => (names[String(item.id)] ?? '').toLowerCase().includes(text))
      .map(([item, parents]) => ({
        item: flatCopy(item),
        path: parents.length > 0 ? parents.map((it) => names[String(it.id)] ?? '').join(' › ') : undefined
      }))
  }

  function hasSubmenu (item: MenuItem<Id>): boolean {
    return (item.children?.length ?? 0) > 0 || item.popup !== undefined
  }

  // A link leads somewhere else, so it gets the arrow unless the item turns it off.
  function opensPage (item: MenuItem<Id>): boolean {
    return item.opensPage ?? item.href !== undefined
  }

  function isChecked (ids: Id[], item: MenuItem<Id>): boolean {
    return ids.includes(item.id)
  }

  function choose (item: MenuItem<Id>): void {
    if (loading) return
    if (multiselect) {
      toggle(item.id)
      return
    }
    chosen = item.id
    if (onSelect !== undefined) onSelect(item.id)
    else dispatch('close', item.id)
  }

  function toggle (id: Id): void {
    if (onToggle !== undefined) {
      onToggle(id)
      return
    }
    const all = flatten(items).map(([item]) => item)
    const exclusive = all.filter((it) => it.exclusive === true).map((it) => it.id)
    let next: Id[]
    if (exclusive.includes(id)) next = selectedIds.includes(id) ? [] : [id]
    else {
      const rest = selectedIds.filter((it) => !exclusive.includes(it))
      next = rest.includes(id) ? rest.filter((it) => it !== id) : [...rest, id]
    }
    selected = next
    dispatch('update', next)
  }

  function popupResult (id: Id, result: unknown, close: boolean): void {
    if (onResult !== undefined) {
      onResult(id, result, close)
      return
    }
    dispatch('submenu', { id, result })
    if (close) dispatch('close', null)
  }

  // One category per menu, so that a menu closes only its own submenu.
  const category = `kit-menu-${Math.random().toString(36).slice(2)}`
  let submenuOf: Id | undefined
  let root: HTMLElement | undefined
  let submenu: PopupResult | undefined
  let submenuProps: Record<string, any> | undefined

  // A toggle in the submenu comes back here as `selected`: the submenu shows it too.
  $: if (submenu !== undefined && submenuProps !== undefined && submenuProps.selected !== selected) {
    submenuProps = { ...submenuProps, selected }
    submenu.update(submenuProps)
  }

  function openSubmenu (item: MenuItem<Id>, row: HTMLElement, focus: boolean): void {
    if (submenuOf === item.id && !focus) return
    const previous = document.activeElement
    closeSubmenu()
    submenuOf = item.id
    const anchor = { getBoundingClientRect: () => row.getBoundingClientRect(), kind: 'submenu' as const }
    const closed = (): void => {
      if (submenuOf !== item.id) return
      stopWatching?.()
      submenuOf = undefined
      submenu = undefined
      submenuProps = undefined
    }
    if (item.popup !== undefined) {
      submenu = showPopup(
        item.popup.component,
        item.popup.props ?? {},
        anchor,
        (result) => {
          closed()
          if (result !== undefined && result !== null) popupResult(item.id, result, true)
        },
        (result) => {
          if (result !== undefined) popupResult(item.id, result, false)
        },
        { category, overlay: false }
      )
    } else {
      // The parent is a choice too: the first row, its children under a line.
      const self = item.submenuOnly === true ? [] : [{ ...item, children: undefined }]
      const children = (item.children ?? []).map((child, i) =>
        i === 0 && self.length > 0 ? { ...child, divider: true } : child
      )
      submenuProps = {
        items: [...self, ...children],
        selected,
        multiselect,
        autofocus: focus,
        onSelect: (id: Id) => {
          chosen = id
          if (onSelect !== undefined) onSelect(id)
          else dispatch('close', id)
        },
        onToggle: toggle,
        onResult: popupResult,
        onBack: () => {
          closeSubmenu()
          row.focus()
        }
      }
      submenu = showPopup(Menu, submenuProps, anchor, closed, undefined, { category, overlay: false })
    }
    // showPopup blurs the active element: it gets the focus back, so hovering does not take it from the search field.
    // Without preventScroll the page jumps to a field or link far from the menu.
    if (!focus && previous instanceof HTMLElement && previous !== document.body) previous.focus({ preventScroll: true })
    if (!focus) keepFocus(previous)
    watchSubmenu(row)
  }

  let stopWatching: (() => void) | undefined

  function watchSubmenu (row: HTMLElement): void {
    // The submenu is placed once by its row: a scroll that moves the row would leave it hanging apart.
    const scrolled = (event: Event): void => {
      const target = event.target
      if (target === document || (target instanceof Node && target.contains(row))) closeSubmenu()
    }
    // The pointer or a press away from the menu and its submenus closes it, which an embedded menu needs too.
    const away = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (root?.contains(target) === true) return
      const popup = target?.closest('.popup')
      if (popup == null || popup === root?.closest('.popup')) closeSubmenu()
    }
    document.addEventListener('scroll', scrolled, true)
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('pointermove', away, true)
    stopWatching = () => {
      document.removeEventListener('scroll', scrolled, true)
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('pointermove', away, true)
      stopWatching = undefined
    }
  }

  let stopKeepingFocus: (() => void) | undefined

  // A popup component may focus its first row on mount, which shows a keyboard ring after a mere hover.
  function keepFocus (previous: Element | null): void {
    stopKeepingFocus?.()
    const back = (event: FocusEvent): void => {
      const target = event.target as HTMLElement
      if (target === previous || root?.contains(target) === true) return
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true })
      } else target.blur()
    }
    // Pointer leaving the menu (into the submenu) or any press hands the focus over to the user.
    const moved = (event: PointerEvent): void => {
      if (root?.contains(event.target as Node) !== true) stop()
    }
    const stop = (): void => {
      document.removeEventListener('focusin', back, true)
      document.removeEventListener('pointermove', moved, true)
      document.removeEventListener('pointerdown', stop, true)
      document.removeEventListener('keydown', stop, true)
      stopKeepingFocus = undefined
    }
    document.addEventListener('focusin', back, true)
    document.addEventListener('pointermove', moved, true)
    document.addEventListener('pointerdown', stop, true)
    document.addEventListener('keydown', stop, true)
    stopKeepingFocus = stop
  }

  function closeSubmenu (): void {
    stopKeepingFocus?.()
    stopWatching?.()
    if (submenuOf === undefined) return
    const open = submenu
    submenuOf = undefined
    submenu = undefined
    submenuProps = undefined
    // closePopup sees only shown popups: a resource still loading is cancelled by its own close.
    open?.close()
    closePopup(category)
  }

  // Search moves the rows: an open submenu would hang apart from its row.
  let searchedFor = ''
  $: if (query !== searchedFor) {
    searchedFor = query
    closeSubmenu()
  }

  function activate (row: Row, element: HTMLElement): void {
    // Without hover (touch) the click opens the submenu; the parent is chosen in it.
    if (hasSubmenu(row.item)) {
      openSubmenu(row.item, element, true)
      return
    }
    choose(row.item)
  }

  function clickLink (row: Row, event: MouseEvent): void {
    // A modifier click is the browser's: the address opens in a new tab.
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    activate(row, event.currentTarget as HTMLElement)
  }

  function hover (row: Row, element: HTMLElement): void {
    // Keeps the keyboard where the pointer is, but leaves the search field its focus.
    if (list?.contains(document.activeElement) === true) element.focus({ preventScroll: true })
    if (hasSubmenu(row.item)) openSubmenu(row.item, element, false)
    else closeSubmenu()
  }

  // Typed handlers: the events of svelte:element are untyped, and the markup takes no type annotations.
  function onRowHover (row: Row): (event: MouseEvent) => void {
    return (event) => {
      hover(row, event.currentTarget as HTMLElement)
    }
  }

  function onRowKeydown (index: number): (event: KeyboardEvent) => void {
    return (event) => {
      rowKeydown(event, index)
    }
  }

  function onRowClick (row: Row): (event: MouseEvent) => void {
    return (event) => {
      if (row.item.href !== undefined) clickLink(row, event)
      else activate(row, event.currentTarget as HTMLElement)
    }
  }

  // Read from the DOM: `bind:this` inside the loop would invalidate `items` and rebuild every row.
  function rowElements (): HTMLElement[] {
    return list === undefined ? [] : Array.from(list.querySelectorAll<HTMLElement>(':scope > .menu__row'))
  }

  function focusRow (index: number): void {
    const elements = rowElements()
    const count = elements.length
    if (count === 0) return
    elements[((index % count) + count) % count]?.focus()
  }

  function rowKeydown (event: KeyboardEvent, index: number): void {
    const row = rows[index]
    const element = event.currentTarget as HTMLElement
    if (event.key === 'ArrowDown') focusRow(index + 1)
    else if (event.key === 'ArrowUp') focusRow(index - 1)
    else if (event.key === 'Home') focusRow(0)
    else if (event.key === 'End') focusRow(rows.length - 1)
    else if (event.key === 'ArrowRight' && hasSubmenu(row.item)) openSubmenu(row.item, element, true)
    else if (event.key === 'ArrowLeft' && onBack !== undefined) onBack()
    else if (event.key === ' ' && row.item.href !== undefined) activate(row, element)
    else if (isTyping(event)) {
      typeahead(event, index)
      return
    } else return
    event.preventDefault()
    event.stopPropagation()
  }

  function isTyping (event: KeyboardEvent): boolean {
    return event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey
  }

  let typed = ''
  let typedTimer: ReturnType<typeof setTimeout> | undefined

  // A letter on a row: with a field it goes there, else the focus jumps to a row starting with the typed text.
  function typeahead (event: KeyboardEvent, index: number): void {
    if (withSearch) {
      searchField?.focus()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    clearTimeout(typedTimer)
    typedTimer = setTimeout(() => {
      typed = ''
    }, 500)
    typed += event.key.toLowerCase()
    const elements = rowElements()
    const count = elements.length
    // Repeating one letter walks through the rows with it; a longer prefix stays on the current row if it matches.
    const repeat = typed.length > 1 && typed.split('').every((char) => char === typed[0])
    const prefix = repeat ? typed[0] : typed
    const start = repeat || typed.length === 1 ? index + 1 : index
    for (let step = 0; step < count; step++) {
      const at = (start + step) % count
      const text = (elements[at]?.textContent ?? '').trim().toLowerCase()
      if (text.startsWith(prefix)) {
        focusRow(at)
        return
      }
    }
  }

  function searchKeydown (event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') focusRow(0)
    else if (event.key === 'ArrowUp') focusRow(rows.length - 1)
    else if (event.key === 'Enter' && rows.length > 0) activate(rows[0], rowElements()[0])
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  /** Keys of a field that keeps the focus (an editor typing the query): arrows move the highlight, Enter chooses. */
  export function onKeydown (event: KeyboardEvent): boolean {
    if (rows.length === 0) return false
    if (event.key === 'ArrowDown') active = (active + 1) % rows.length
    else if (event.key === 'ArrowUp') active = active <= 0 ? rows.length - 1 : active - 1
    else if (event.key === 'Enter' && active >= 0) activate(rows[active], rowElements()[active])
    else return false
    event.preventDefault()
    event.stopPropagation()
    rowElements()[active]?.scrollIntoView({ block: 'nearest' })
    return true
  }

  export function focus (): void {
    if (withSearch) searchField?.focus()
    else {
      focusRow(
        Math.max(
          0,
          rows.findIndex(({ item }) => isChecked(selectedIds, item))
        )
      )
    }
  }

  onMount(() => {
    if (autofocus) void tick().then(focus)
  })

  onDestroy(() => {
    closeSubmenu()
    clearTimeout(typedTimer)
  })

  // The scrollbar is hidden on some systems: a fade marks the rows hidden above or below.
  let fadeTop = false
  let fadeBottom = false

  // Marks at both ends of the rows: unlike a size observer they also catch rows growing inside a capped list.
  function watchEdges (node: HTMLElement): { destroy: () => void } | undefined {
    if (typeof IntersectionObserver === 'undefined') return
    const top = node.querySelector(':scope > .menu__edge--top')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === top) fadeTop = !entry.isIntersecting
          else fadeBottom = !entry.isIntersecting
        }
      },
      { root: node }
    )
    node.querySelectorAll(':scope > .menu__edge').forEach((edge) => {
      observer.observe(edge)
    })
    return {
      destroy: () => {
        observer.disconnect()
      }
    }
  }

  function swatchOf (color: number, dark: boolean): string {
    return getPlatformColorDef(color, dark).color
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={root}
  class="menu menu--{width}"
  class:menu--embedded={embedded}
  style:min-width={minWidth}
  use:resizeObserver={() => {
    dispatch('changeContent', null)
  }}
>
  {#if withSearch}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="menu__search"
      class:menu__search--open={headings === 'lines' && rows[0]?.item.heading !== undefined}
      on:keydown={searchKeydown}
    >
      <span class="menu__field">
        <SearchInput
          bind:this={searchField}
          bind:value={search}
          placeholder={searchPlaceholder}
          kind="secondary"
          size="small"
          delay={0}
          fullWidth
        />
      </span>
      <slot name="actions" />
    </div>
  {/if}
  {#if $$slots.header}
    <div class="menu__header"><slot name="header" /></div>
  {/if}
  <div
    class="menu__list"
    class:menu__list--fade-top={fadeTop}
    class:menu__list--fade-bottom={fadeBottom}
    role="menu"
    aria-busy={loading}
    bind:this={list}
    use:watchEdges
    {...$$restProps}
  >
    <span class="menu__edge menu__edge--top" aria-hidden="true" />
    {#each rows as row, i (row.item.id)}
      {@const item = row.item}
      {@const checked = isChecked(selectedIds, item)}
      {@const busy = loading && (chosen ?? selected) === item.id}
      {@const swatch = item.color !== undefined ? swatchOf(item.color, $themeStore.dark) : undefined}
      {#if item.heading !== undefined}
        <!-- The first group already sits under the search or the menu edge: no line above it. -->
        {#if i > 0 && headings === 'divider'}<div class="menu__divider" role="separator" />{/if}
        <div class="menu__heading" role="presentation">
          {#if headings === 'lines'}<span class="menu__line" />{/if}
          <span class="menu__heading-label"><Label label={item.heading} /></span>
          {#if headings === 'lines'}<span class="menu__line" />{/if}
        </div>
      {:else if item.divider === true && i > 0}
        <div class="menu__divider" role="separator" />
      {/if}
      <svelte:element
        this={item.href !== undefined ? 'a' : 'button'}
        class="menu__row no-underline"
        class:menu__row--active={i === active}
        class:menu__row--two-lines={item.description !== undefined || row.path !== undefined}
        type={item.href !== undefined ? undefined : 'button'}
        href={item.href}
        {role}
        tabindex={i === tabStop ? 0 : -1}
        aria-checked={role === 'menuitem' ? undefined : checked}
        aria-haspopup={hasSubmenu(item) ? 'menu' : undefined}
        aria-expanded={hasSubmenu(item) ? submenuOf === item.id : undefined}
        aria-disabled={loading ? true : undefined}
        on:mouseover={onRowHover(row)}
        on:focus={() => {
          active = -1
          lastFocused = i
        }}
        on:keydown={onRowKeydown(i)}
        on:click={onRowClick(row)}
      >
        {#if withIcons}
          <span class="menu__icon">
            {#if swatch !== undefined}
              <span class="menu__swatch" style:background-color={swatch} />
            {:else if item.icon !== undefined}
              <Icon icon={item.icon} iconProps={item.iconProps} size="small" />
            {/if}
          </span>
        {/if}
        {#if item.component !== undefined}
          <span class="menu__custom"><svelte:component this={item.component} {...item.componentProps ?? {}} /></span>
        {:else}
          <span class="menu__labels">
            <span class="menu__label">
              <Label label={item.label} params={item.labelParams ?? {}} />
            </span>
            {#if row.path !== undefined}
              <span class="menu__description"><Label label={getEmbeddedLabel(row.path)} /></span>
            {:else if item.description !== undefined}
              <span class="menu__description">
                <Label label={item.description} params={item.descriptionParams ?? {}} />
              </span>
            {/if}
          </span>
        {/if}
        {#if withChecks || busy || hasSubmenu(item) || opensPage(item)}
          <span class="menu__trail">
            {#if withChecks || busy}
              <span class="menu__icon">
                {#if busy}
                  <Spinner size="small" />
                {:else if checked}
                  <IconCheck size="small" />
                {/if}
              </span>
            {/if}
            {#if withArrows}
              <span class="menu__icon menu__icon--secondary">
                {#if hasSubmenu(item)}
                  <IconChevronRight size="small" />
                {:else if opensPage(item)}
                  <IconArrowUpRight size="small" />
                {/if}
              </span>
            {/if}
          </span>
        {/if}
      </svelte:element>
    {:else}
      <div class="menu__empty"><Label label={ui.string.NoResults} /></div>
    {/each}
    <span class="menu__edge menu__edge--bottom" aria-hidden="true" />
  </div>
</div>

<style lang="scss">
  .menu {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 1px;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--small-BorderRadius);
    box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
      var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);

    &--fit {
      width: max-content;
      min-width: 10rem;
      max-width: 16.5rem;
    }
    &--wide {
      width: 32rem;
      min-width: 24rem;
      max-width: 90vw;
    }
    &--x-wide {
      width: 40rem;
      min-width: 28rem;
      max-width: 90vw;
    }
    // Inside a panel or tooltip the place sets the width: the rows and lines fill it.
    &--fit.menu--embedded {
      width: auto;
      min-width: 0;
      max-width: none;
    }
    &--embedded {
      padding: 0;
      background-color: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
  }

  // The wider right inset puts a small action button over the check column of the rows.
  .menu__search {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_5);
    // A filled field with room around it for its focus ring, which stands outside.
    padding: var(--spacing-1_5);
    border-bottom: 1px solid var(--theme-popup-divider);

    // The first heading's lines already part the field from the rows; the list padding keeps room for the focus ring.
    &--open {
      padding-bottom: 0;
      border-bottom-color: transparent;
    }
  }

  .menu__field {
    flex-grow: 1;
    min-width: 0;
  }

  .menu__header {
    flex-shrink: 0;
    padding: var(--spacing-1) var(--spacing-1_5);
    border-bottom: 1px solid var(--theme-popup-divider);

    // A header slot that renders nothing conditionally leaves no empty band.
    &:empty {
      display: none;
    }
  }

  .menu__list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_25);
    min-height: 0;
    // Ten rows and a half: ten fit whole as in the legacy popups, a cut row shows that a longer list scrolls.
    max-height: calc(2 * var(--spacing-1) + 10 * (var(--_menu-row) + var(--spacing-0_25)) + var(--_menu-row) / 2);
    padding: var(--spacing-1);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: thin;
    // Arrow keys scroll a row clear of the fade, not into it.
    scroll-padding-block: var(--_menu-fade);
    --_menu-row: 2.5rem;
    --_menu-fade: calc(var(--_menu-row) / 2 + var(--spacing-0_25));

    .menu--embedded > & {
      max-height: none;
    }

    &--fade-top,
    &--fade-bottom {
      --_top: 0px;
      --_bottom: 0px;
      mask-image: linear-gradient(
        to bottom,
        transparent 0,
        black var(--_top),
        black calc(100% - var(--_bottom)),
        transparent 100%
      );
    }
    &--fade-top {
      --_top: var(--_menu-fade);
    }
    &--fade-bottom {
      --_bottom: var(--_menu-fade);
    }
  }

  .menu__row {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
    padding: var(--spacing-1_25) var(--spacing-1);
    font: inherit;
    line-height: 1.25rem;
    text-align: left;
    text-decoration: none;
    color: var(--global-primary-TextColor);
    background-color: transparent;
    border: none;
    border-radius: var(--extra-small-BorderRadius);
    cursor: pointer;

    &:hover,
    &:focus,
    &--active {
      background-color: var(--theme-popup-hover);
    }
    // The focused row is marked by its fill alone, as under the pointer: a ring reads as a stray outline.
    &:focus {
      outline: none;
    }
    &[aria-disabled='true'] {
      cursor: not-allowed;
    }
    &--two-lines {
      align-items: flex-start;
    }
  }

  // Icons of a two-line row stand on the label's line, not on the top edge of its text.
  .menu__row--two-lines .menu__icon {
    height: 1.25rem;
  }

  .menu__icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: var(--global-min-Size);
    height: var(--global-min-Size);
    color: var(--global-primary-TextColor);

    &--secondary {
      color: var(--global-secondary-TextColor);
    }
  }

  // With the row gap it keeps spacing-3 from the text; an empty one still reserves the width.
  .menu__trail {
    display: inline-flex;
    flex-shrink: 0;
    justify-content: flex-end;
    gap: var(--spacing-1_5);
    margin-left: var(--spacing-2);
    min-width: var(--global-min-Size);
  }

  .menu__swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: var(--extra-small-BorderRadius);
  }

  .menu__labels {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: var(--spacing-0_25);
    min-width: 0;
  }

  .menu__label,
  .menu__description {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .menu__label {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.25rem;
  }

  .menu__description {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--global-secondary-TextColor);
  }

  // The row's own markup is not a target of its own: a click chooses the row.
  .menu__custom {
    display: flex;
    flex-grow: 1;
    align-items: center;
    min-width: 0;
    pointer-events: none;
  }

  // Zero-height marks; the negative margin takes back the gap they add.
  .menu__edge {
    flex-shrink: 0;
    height: 0;

    &--top {
      margin-bottom: calc(-1 * var(--spacing-0_25));
    }
    &--bottom {
      margin-top: calc(-1 * var(--spacing-0_25));
    }
  }

  // Edge to edge, over the list padding.
  .menu__divider {
    flex-shrink: 0;
    height: 1px;
    // With the row gap it gives 0.25rem above and below the line.
    margin: var(--spacing-0_25) calc(-1 * var(--spacing-1));
    background-color: var(--theme-popup-divider);
  }

  .menu__heading {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-1) var(--spacing-0_5);
    min-width: 0;
  }

  .menu__heading-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.625rem;
    font-weight: 500;
    line-height: 0.75rem;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--global-tertiary-TextColor);
  }

  .menu__line {
    flex: 1;
    min-width: 0.5rem;
    height: 1px;
    background-color: var(--theme-popup-divider);
  }

  .menu__empty {
    padding: var(--spacing-1_5) var(--spacing-2);
    text-align: center;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--global-secondary-TextColor);
  }
</style>
