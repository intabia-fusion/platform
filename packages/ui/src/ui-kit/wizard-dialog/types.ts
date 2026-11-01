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

import type { DialogWidth } from '../dialog/types'
import type { StepsItem } from '../steps/types'

/** A dialog that goes through steps: the steps aside, Back and Next in the footer, the submit on the last step. */
export interface WizardDialogProps<Id extends string = string> {
  label: IntlString
  labelParams?: Record<string, any>
  steps: ReadonlyArray<StepsItem<Id>>
  /** The current step, the first one by default; supports `bind:selected`. */
  selected?: Id
  /** `true` by default: Next is enabled, the current step is valid. */
  canProceed?: boolean
  /** `true` by default: the submit on the last step is enabled. */
  canSubmit?: boolean
  submitLabel?: IntlString
  /**
   * The submit is offered on every step, when the later steps are optional: Back and Next stand together on the left,
   * the submit on the right is secondary before the last step and positive on it.
   */
  earlySubmit?: boolean
  /** The submit is running: Back and the submit are blocked, the submit shows a spinner. */
  loading?: boolean
  /** `x-large` by default. */
  width?: DialogWidth
  id?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface WizardDialogEvents<Id extends string = string> {
  /** Back or Next moves to this step. Cancelable: `preventDefault()` keeps the current step. */
  select: CustomEvent<Id>
  submit: CustomEvent<null>
  /** Cancelable, as at `Dialog`: `preventDefault()` keeps the dialog open. */
  cancel: CustomEvent<null>
  close: CustomEvent<null>
}

export interface WizardDialogSlots {
  /** The body of the current step. */
  default: Record<string, never>
  /** Footer after Back: a hint or an error of the current step. */
  footerStart: Record<string, never>
}
