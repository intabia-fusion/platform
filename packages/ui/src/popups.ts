//
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
//

import { getResource } from '@hcengineering/platform'
import { type ComponentType } from 'svelte'
import { derived, get } from 'svelte/store'
import type {
  AnyComponent,
  AnySvelteComponent,
  DeviceOptions,
  HorizontalAlignment,
  PopupAlignment,
  PopupOptions,
  PopupPositionElement,
  VerticalAlignment
} from './types'

import { Analytics } from '@hcengineering/analytics'
import { modalStore } from './modals'

export interface CompAndProps {
  type?: 'popup'
  id: string
  is: AnySvelteComponent | ComponentType
  props: any
  element?: PopupAlignment
  onClose?: (result: any) => void
  onUpdate?: (result: any) => void
  close: () => void
  update?: (props: Record<string, any>) => void
  options: {
    category: string
    overlay: boolean
    fixed?: boolean
    refId?: string
  }
  dock?: boolean

  // Internal
  closing?: boolean
  anchor?: HTMLElement
  order?: number
  keyboard?: boolean
}

// Popups shown and not closed yet, by the order of showPopup calls (a component still loading counts too).
const openOrders = new Set<number>()
let lastOrder = 0

// Opening a popup blurs the control that opened it; closing gives the focus back unless something else took it.
function restoreAnchorFocus (popup: Pick<CompAndProps, 'anchor' | 'order' | 'keyboard'>): void {
  const { anchor, order, keyboard } = popup
  if (order !== undefined) openOrders.delete(order)
  // A control clicked with the mouse would light its focus ring after Esc, a keyboard key itself.
  if (anchor === undefined || keyboard !== true) return
  setTimeout(() => {
    // A popup opened after this one (a confirmation from a menu item) keeps the focus away from the control under it.
    if (order !== undefined && [...openOrders].some((o) => o > order)) return
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    if (!anchor.isConnected || (anchor as HTMLButtonElement).disabled) return
    anchor.focus({ preventScroll: true })
  })
}

export interface PopupResult {
  id: string
  close: () => void
  update: (props: Record<string, any>) => void
}

export const popupstore = derived(modalStore, (modals) => {
  return modals.filter((m) => m.type === 'popup') as CompAndProps[]
})

export const dockStore = derived(modalStore, (modals) => {
  return (modals.filter((m) => m.type === 'popup') as CompAndProps[]).find((popup: CompAndProps) => popup.dock === true)
})

export function updatePopup (id: string, props: Partial<CompAndProps>): void {
  modalStore.update((modals) => {
    // Tooltips share modalStore, so the popup is looked up among all modals, not by its index among popups.
    const popup = modals.find((m) => m.type === 'popup' && m.id === id) as CompAndProps | undefined
    popup?.update?.(props.props)
    return modals
  })
}

function addPopup (props: CompAndProps): void {
  modalStore.update((modals) => {
    modals.push(props)
    return modals
  })
}

function checkDockPosition (refId: string | undefined): boolean {
  if (refId !== undefined && localStorage.getItem('dock-popup') === refId) {
    const docked = get(dockStore)
    if (docked === undefined) {
      return true
    }
  }
  return false
}

let popupId: number = 0
export function showPopup (
  component: AnySvelteComponent | AnyComponent | ComponentType,
  props: any,
  element?: PopupAlignment,
  onClose?: (result: any) => void | Promise<void>,
  onUpdate?: (result: any) => void | Promise<void>,
  options: {
    category: string
    overlay: boolean
    fixed?: boolean
    refId?: string
    id?: string
  } = {
    category: 'popup',
    overlay: true
  }
): PopupResult {
  const id = options?.id ?? `${popupId++}`
  let replaced: CompAndProps | undefined
  let added = false
  let cancelled = false
  const closePopupOp = (restoreFocus: boolean = true): void => {
    modalStore.update((popups) => {
      const pos = popups.findIndex((p) => (p as CompAndProps).id === id && p.type === 'popup')
      if (pos !== -1) {
        const popup = popups[pos] as CompAndProps
        if (restoreFocus) restoreAnchorFocus(popup)
        else replaced = popup
        popups.splice(pos, 1)
      } else if (restoreFocus && !added && !cancelled) {
        // Closed while its component is still loading: it must not show up once loaded.
        cancelled = true
        restoreAnchorFocus(data)
      }
      return popups
    })
  }
  // Reopening the same id replaces the popup: the focus stays with the new one, the control that opened it carries over.
  closePopupOp(false)
  if (replaced?.order !== undefined) openOrders.delete(replaced.order)
  const active = document.activeElement
  const anchor =
    replaced?.anchor?.isConnected === true
      ? replaced.anchor
      : active instanceof HTMLElement && active !== document.body
        ? active
        : undefined
  const order = ++lastOrder
  openOrders.add(order)
  const keyboard =
    replaced?.anchor?.isConnected === true ? replaced.keyboard : anchor?.matches(':focus-visible') === true
  const editable = anchor?.isContentEditable === true || anchor?.tagName === 'INPUT' || anchor?.tagName === 'TEXTAREA'
  if (anchor !== undefined && !editable) anchor.blur()

  const _element = element instanceof HTMLElement ? getPopupPositionElement(element) : element
  const data: Omit<CompAndProps, 'is'> = {
    id,
    props,
    element: _element,
    onClose: (result: any) => {
      void onClose?.(result)
    },
    onUpdate: (result: any) => {
      void onUpdate?.(result)
    },
    close: () => {
      closePopupOp()
    },
    options,
    type: 'popup',
    anchor,
    order,
    keyboard
  }
  if (checkDockPosition(options.refId)) {
    data.dock = true
  }
  if (typeof component === 'string') {
    getResource(component)
      .then((resolved) => {
        if (cancelled) return
        added = true
        addPopup({ ...data, is: resolved })
      })
      .catch((err) => {
        openOrders.delete(order)
        Analytics.handleError(err)
        console.error(err)
      })
  } else {
    added = true
    addPopup({ ...data, is: component })
  }
  return {
    id,
    close: () => {
      closePopupOp()
    },
    update: (props) => {
      updatePopup(id, { props })
    }
  }
}

export function closePopup (category?: string): void {
  modalStore.update((popups) => {
    if (category !== undefined) {
      for (const popup of popups) {
        if (popup.type === 'popup' && popup.options.category === category) restoreAnchorFocus(popup as CompAndProps)
      }
      popups = popups.filter((p) => p.type !== 'popup' || p.options.category !== category)
    } else {
      for (let i = popups.length - 1; i >= 0; i--) {
        if (popups[i].type !== 'popup') continue
        const popi = popups[i] as CompAndProps
        if (popi.options.fixed !== true) {
          const isClosing = popi.closing ?? false
          if (popups[i].type === 'popup') {
            popi.closing = true
          }
          if (!isClosing) {
            // To prevent possible recursion, we need to check if we call some code from popup close, to do close.
            popi.onClose?.(undefined)
          }
          popi.closing = false
          restoreAnchorFocus(popi)
          popups.splice(i, 1)
          break
        }
      }
    }
    return popups
  })
}

/**
 * @public
 *
 * Place element based on position and element.
 *
 * return boolean to show or not modal overlay.
 */
export function fitPopupPositionedElement (
  modalHTML: HTMLElement,
  alignment: PopupPositionElement,
  newProps: Record<string, string | number>
): PopupOptions {
  let direction: string = ''
  const rect = alignment.getBoundingClientRect()
  const rectPopup = modalHTML.getBoundingClientRect()
  const docWidth = document.body.clientWidth
  const docHeight = document.body.clientHeight
  newProps.left = newProps.right = newProps.top = newProps.bottom = ''
  newProps.maxHeight = newProps.height = ''
  newProps.maxWidth = newProps.width = ''
  if (alignment?.kind === 'submenu') {
    const dirH =
      docWidth - rect.right - rectPopup.width - 12 > 0 ? 'right' : rect.left > docWidth - rect.left ? 'left' : 'inside'
    const dirV =
      docHeight - rect.top - rectPopup.height - 20 > 0
        ? 'bottom'
        : rect.bottom > rectPopup.height + 20
          ? 'top'
          : 'bottom'
    if (dirH === 'right') newProps.left = `${rect.right - 4}px`
    else if (dirH === 'inside') newProps.right = '1rem'
    else newProps.right = `${docWidth - rect.left - 4}px`
    if (dirV === 'bottom') newProps.top = `${rect.top - 4}px`
    else newProps.bottom = `${docHeight - rect.bottom - 4}px`
    direction = `${dirV}|${dirH}`
  } else if (alignment.position !== undefined) {
    if (alignment.position.v === 'top') {
      newProps.top = `${rect.top}px`
    } else if (alignment.position.v === 'bottom') {
      newProps.top = `${rect.bottom - rectPopup.height}px`
    }

    if (alignment.position.h === 'right') {
      newProps.left = `${rect.right + 4}px`
    } else if (alignment.position.h === 'left') {
      newProps.left = `${rect.left - rectPopup.width - 4}px`
    }
    direction = alignment.position.v + '|' + alignment.position.h
  } else {
    // Vertical
    if (rect.bottom + rectPopup.height + 28 <= docHeight) {
      newProps.top = `${rect.bottom + 16}px`
      direction = 'bottom'
    } else if (rectPopup.height + 28 < rect.top) {
      newProps.bottom = `${docHeight - rect.top + 16}px`
      direction = 'top'
    } else {
      newProps.top = newProps.bottom = '16px'
      direction = 'top'
    }

    // Horizontal
    if (rect.left + rectPopup.width + 16 <= docWidth) {
      newProps.left = `${rect.left}px`
      direction += '|right'
    } else if (rect.right - rectPopup.width - 16 >= 0) {
      newProps.right = `${docWidth - rect.right}px`
      direction += '|left'
    } else {
      newProps.left = '16px'
      direction += '|center'
    }
  }
  return { props: newProps, showOverlay: false, direction }
}

/**
 * @public
 *
 * Place element based on position and underline content element.
 *
 * return boolean to show or not modal overlay.
 */
export function fitPopupElement (
  modalHTML: HTMLElement,
  device: DeviceOptions,
  element?: PopupAlignment,
  contentPanel?: HTMLElement,
  clientWidth?: number,
  clientHeight?: number
): PopupOptions {
  let show = true
  const newProps: Record<string, string | number> = {}
  if (element != null) {
    show = false
    newProps.left = newProps.right = newProps.top = newProps.bottom = ''
    newProps.maxHeight = newProps.height = ''
    newProps.maxWidth = newProps.width = newProps.minWidth = ''
    if (typeof element !== 'string') {
      const result = fitPopupPositionedElement(modalHTML, element, newProps)
      return result
    } else if (element === 'right' && contentPanel !== undefined) {
      const rect = contentPanel.getBoundingClientRect()
      newProps.top = `calc(${rect.top}px + 8px)`
      newProps.bottom = '0.75rem'
      newProps.right = '0.75rem'
      newProps.maxWidth = '50%'
      show = true
    } else if (element === 'top') {
      const fullHeight = clientHeight !== undefined && clientHeight / device.docHeight > 0.745
      if (clientWidth !== undefined && clientHeight !== undefined) {
        newProps.left = `calc(50% - ${clientWidth / 2}px`
      } else {
        newProps.left = '50%'
        newProps.transform = 'translateX(-50%)'
      }
      newProps.top = fullHeight ? `${(device.docHeight - clientHeight) / 2}px` : '15vh'
      newProps.maxHeight = fullHeight ? 'calc(100vh - 2rem)' : '75vh'
      show = true
    } else if (element === 'float') {
      newProps.top = 'calc(var(--status-bar-height) + 4px)'
      newProps.bottom = '4px'
      newProps.left = '60%'
      newProps.right = '4px'
      show = true
    } else if (element === 'center') {
      if (clientWidth !== undefined && clientHeight !== undefined) {
        newProps.top = `calc(50% - ${clientHeight / 2}px`
        newProps.left = `calc(50% - ${clientWidth / 2}px`
      } else {
        newProps.top = '50%'
        newProps.left = '50%'
        newProps.transform = 'translate(-50%, -50%)'
      }
      show = true
    } else if (element === 'centered') {
      newProps.top = newProps.bottom = '15%'
      newProps.left = newProps.right = '25%'
      show = true
    } else if (element === 'logo') {
      newProps.top = '2.75rem'
      newProps.left = '5rem'
      newProps.maxWidth = '42rem'
      newProps.maxHeight = 'calc(100vh - 5.5rem)'
      show = true
    } else if (element === 'logo-mini') {
      newProps.top = '2.5rem'
      newProps.left = '.5rem'
      newProps.maxWidth = '42rem'
      newProps.maxHeight = 'calc(100vh - 5.5rem)'
      show = true
    } else if (element === 'logo-portrait') {
      newProps.bottom = 'calc(var(--app-panel-width) + .75rem)'
      newProps.left = '.5rem'
      newProps.maxWidth = 'calc(100vw - 1rem)'
      newProps.maxHeight = 'calc(100vh - var(--app-panel-width) - 1.5rem)'
      show = true
    } else if (element === 'account') {
      newProps.bottom = '2.75rem'
      newProps.left = '5rem'
      newProps.maxWidth = '42rem'
      newProps.maxHeight = 'calc(100vh - 5.5rem)'
      show = true
    } else if (element === 'account-portrait') {
      newProps.bottom = 'calc(var(--app-panel-width) + .75rem)'
      newProps.right = '.5rem'
      newProps.maxWidth = 'calc(100vw - 1rem)'
      newProps.maxHeight = 'calc(100vh - var(--app-panel-width) - 1.5rem)'
      show = true
    } else if (element === 'account-mobile') {
      newProps.bottom = '.5rem'
      newProps.left = 'calc(var(--app-panel-width) + .5rem)'
      newProps.maxWidth = 'calc(100vw - var(--app-panel-width) - 1rem)'
      newProps.maxHeight = 'calc(100vh - 1rem)'
      show = true
    } else if (element === 'notify') {
      newProps.top = '2.5rem'
      newProps.left = '4.75rem'
      newProps.maxWidth = '42rem'
      newProps.maxHeight = 'calc(100vh - 5rem)'
      show = true
    } else if (element === 'notify-mobile') {
      newProps.bottom = 'calc(var(--app-panel-width) + .75rem)'
      newProps.left = '.5rem'
      newProps.maxWidth = 'calc(100vw - 1rem)'
      newProps.maxHeight = 'calc(100vh - var(--app-panel-width) - 1.5rem)'
      show = true
    } else if (element === 'full' && contentPanel === undefined) {
      newProps.top = '0'
      newProps.bottom = '0'
      newProps.left = '0'
      newProps.right = '0'
      newProps.height = '100vh'
      show = false
    } else if (element === 'full' && contentPanel !== undefined) {
      const rect = contentPanel.getBoundingClientRect()
      newProps.top = `${rect.top + 1}px`
      newProps.bottom = '1px'
      newProps.left = '1px'
      newProps.right = '1px'
      show = true
    } else if (element === 'full-centered') {
      const rect = contentPanel !== undefined ? contentPanel.getBoundingClientRect() : { top: 0 }
      newProps.top = `${Math.max(20, rect.top + 1)}px`
      newProps.bottom = '.5rem'
      newProps.left = '.5rem'
      newProps.right = '.5rem'
      show = true
    } else if (element === 'content' && contentPanel !== undefined) {
      const rect = contentPanel.getBoundingClientRect()
      newProps.top = `${rect.top}px`
      newProps.height = `${Math.min(rect.height, window.innerHeight - rect.top)}px`
      newProps.left = `${rect.left}px`
      newProps.width = `${Math.min(rect.width, window.innerWidth - rect.left)}px`
    } else if (element === 'middle') {
      if (contentPanel !== undefined) {
        const rect = contentPanel.getBoundingClientRect()
        newProps.top = `calc(${rect.top}px)`
      } else {
        newProps.top = '15%'
      }
      newProps.bottom = '12px'

      if (clientWidth !== undefined && clientHeight !== undefined) {
        newProps.left = `calc(50% - ${clientWidth / 2}px`
      } else {
        newProps.left = '50%'
        newProps.transform = 'translateX(-50%)'
      }
    } else if (element === 'help-center') {
      newProps.top = 'calc(var(--status-bar-height) + 12px)'
      newProps.bottom = '12px'
      newProps.right = '12px'
      show = true
    } else if (element === 'status') {
      newProps.top = 'calc(var(--status-bar-height) + 7.5px)'
      newProps.right = '12px'
    } else if (element === 'movable') {
      newProps.top = 'calc(var(--status-bar-height) + 4px)'
      newProps.right = '1rem'
    }
  } else {
    if (clientWidth !== undefined && clientHeight !== undefined) {
      newProps.top = `calc(50% - ${clientHeight / 2}px`
      newProps.left = `calc(50% - ${clientWidth / 2}px`
    } else {
      newProps.top = '50%'
      newProps.left = '50%'
      newProps.transform = 'translate(-50%, -50%)'
    }
    show = true
  }
  return { props: newProps, showOverlay: show, direction: '' }
}

export function eventToHTMLElement (evt: MouseEvent | TouchEvent): HTMLElement {
  return evt.target as HTMLElement
}

export function getEventPopupPositionElement (
  e?: Event,
  position?: { v: VerticalAlignment, h: HorizontalAlignment }
): PopupAlignment | undefined {
  if (e?.target == null) {
    return undefined
  }
  const target = e.target as HTMLElement
  return getPopupPositionElement(target, position)
}

export function getPopupPositionElement (
  el: HTMLElement | undefined,
  position?: { v: VerticalAlignment, h: HorizontalAlignment }
): PopupAlignment | undefined {
  if (el?.getBoundingClientRect != null) {
    const result = el.getBoundingClientRect()
    return {
      getBoundingClientRect: () => result,
      position
    }
  }

  return undefined
}
export function getEventPositionElement (evt: MouseEvent): PopupAlignment | undefined {
  const rect = DOMRect.fromRect({ width: 1, height: 1, x: evt.clientX, y: evt.clientY })
  return {
    getBoundingClientRect: () => rect
  }
}

export function pin (id: string): void {
  modalStore.update((popups) => {
    const currentPopups = popups.filter((m) => m.type === 'popup') as CompAndProps[]
    const current = currentPopups.find((p) => p.id === id) as CompAndProps
    ;(popups.filter((m) => m.type === 'popup') as CompAndProps[]).forEach((p) => (p.dock = p.id === id))
    if (current?.options.refId !== undefined) {
      localStorage.setItem('dock-popup', current.options.refId)
    }
    return popups
  })
}

export function unpin (): void {
  modalStore.update((popups) => {
    ;(popups.filter((m) => m.type === 'popup') as CompAndProps[]).forEach((p) => (p.dock = false))
    return popups
  })
  localStorage.removeItem('dock-popup')
}
