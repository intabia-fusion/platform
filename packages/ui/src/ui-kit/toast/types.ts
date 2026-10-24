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

/** Icon before the title; without a tone there is no icon. `error` and `warning` are announced at once. */
export type ToastTone = 'info' | 'success' | 'warning' | 'error'

/**
 * A pop-up notification card: title, content (default slot), actions (slot `actions`, at the end).
 * The notifications host places and removes it; the card only draws itself.
 */
export interface ToastProps {
  /** A ready text, such as the notification title, goes through `getEmbeddedLabel`; slot `title` replaces it. */
  title: IntlString
  titleParams?: Record<string, any>
  tone?: ToastTone
  /** Shows the close button, which reports `close`. */
  closable?: boolean
}

export interface ToastEvents {
  /** The close button was clicked; a DOM event without detail carries `null`. */
  close: CustomEvent<null>
}
