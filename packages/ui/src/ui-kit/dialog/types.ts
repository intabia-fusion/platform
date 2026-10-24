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

import type { IntlString } from '@hcengineering/platform'

import type { LabelAndProps } from '../../types'
import type { ButtonKind } from '../button/types'

/**
 * Width of the card: `x-small` 25rem, `small` 30rem, `medium` 37.5rem, `large` 45rem (default), `x-large` 58.25rem;
 * `auto` - by the content, `full` - fills the place (a viewer in a sized popup).
 */
export type DialogWidth = 'x-small' | 'small' | 'medium' | 'large' | 'x-large' | 'auto' | 'full'

/** Padding of the body: `default`, or `none` for a list, a viewer or a diagram that reaches the edges. */
export type DialogPadding = 'default' | 'none'

/** Kinds of the submit button: the dialog's main action. */
export type DialogSubmitKind = Extract<ButtonKind, 'primary' | 'brand' | 'positive' | 'negative' | 'secondary'>

export interface DialogProps {
  /** Title in the header; custom title markup goes to the `title` slot. */
  label?: IntlString
  labelParams?: Record<string, any>
  width?: DialogWidth
  padding?: DialogPadding
  /** `true` by default: the body scrolls; `false` when the content scrolls on its own. */
  scrollable?: boolean
  /** Fills the place without the card look: a settings aside, a page. */
  embedded?: boolean
  /** `true` by default: the close button in the header. */
  closable?: boolean
  /**
   * Escape cancels the dialog; for an embedded one. In a popup the host handles Escape and a click outside itself and
   * asks the dialog's `canClose()`, which sends the same cancelable `cancel`.
   */
  closeOnEscape?: boolean
  /** Shows the full size toggle in the header. */
  allowFullSize?: boolean
  /** Fills the window; supports `bind:fullSize`. */
  fullSize?: boolean
  /** `true` by default: the footer with the actions. */
  footer?: boolean
  submitLabel?: IntlString
  submitKind?: DialogSubmitKind
  submitTooltip?: LabelAndProps
  canSubmit?: boolean
  hideSubmit?: boolean
  cancelLabel?: IntlString
  hideCancel?: boolean
  /** The submit is running: a spinner on the submit button, which is blocked. */
  loading?: boolean
  /** Enter in a field submits the dialog; otherwise only the submit button does. */
  submitOnEnter?: boolean
  id?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface DialogEvents {
  /** The submit button or, with `submitOnEnter`, Enter in a field. */
  submit: CustomEvent<null>
  /**
   * The close button, the cancel button, Escape or `canClose()` from the popup host. Cancelable: `preventDefault()` keeps the dialog open (asking to
   * discard changes), otherwise `close` follows.
   */
  cancel: CustomEvent<null>
  /** The dialog should close: the popup host closes it. */
  close: CustomEvent<null>
  /** The full size toggle switched. */
  fullsize: CustomEvent<boolean>
}

export interface DialogSlots {
  /** The body. */
  default: Record<string, never>
  /** Title markup after the label: an icon, a name with its own presenter. */
  title: Record<string, never>
  /** Header buttons before the full size toggle and the close button. */
  actions: Record<string, never>
  /** Start of the footer: a hint, an error, a secondary action. */
  footerStart: Record<string, never>
  /** Extra buttons between the cancel and the submit buttons; with `hideSubmit` - the actions themselves. */
  footerActions: Record<string, never>
}
