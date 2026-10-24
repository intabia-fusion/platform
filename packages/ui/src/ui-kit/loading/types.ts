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

import type { SpinnerSize } from '../spinner/types'

/** Placeholder of an area whose content is loading: a spinner in the middle of the whole place. */
export interface LoadingProps {
  /** Spinner size, `medium` by default. */
  size?: SpinnerSize
  /** Text after the spinner ("Workspace is being created"); without it a hidden "Loading" is announced. */
  label?: IntlString
  labelParams?: Record<string, any>
  /** Shows up after a short pause, so a fast load does not flash; on by default. */
  delay?: boolean
}
