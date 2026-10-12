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

import { type Action } from '@hcengineering/ui'

// An applet knows nothing of the message around it, so its items travel with the event up to the message menu.
const appletActions = new WeakMap<Event, Action[]>()

/**
 * @public
 */
export function addAppletContextActions (event: Event, actions: Action[]): void {
  appletActions.set(event, [...(appletActions.get(event) ?? []), ...actions])
}

/**
 * @public
 */
export function getAppletContextActions (event: Event): Action[] {
  return appletActions.get(event) ?? []
}
