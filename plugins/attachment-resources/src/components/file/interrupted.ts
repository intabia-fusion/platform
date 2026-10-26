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

import { translate } from '@hcengineering/platform'
import { addNotification, NotificationSeverity } from '@hcengineering/ui'
import { SimpleNotification } from '@hcengineering/view-resources'

import attachment from '../../plugin'

/** A toast, not a tile: the input or form that held these files is gone by now. */
export async function notifyInterrupted (names: string[]): Promise<void> {
  if (names.length === 0) return
  addNotification(
    await translate(attachment.string.UploadInterrupted, {}),
    await translate(attachment.string.UploadInterruptedHint, { count: names.length, names: names.join(', ') }),
    SimpleNotification,
    undefined,
    NotificationSeverity.Info
  )
}

/** Files that failed while a form waited to save: it is saved without them. */
export async function notifyFailed (names: string[]): Promise<void> {
  if (names.length === 0) return
  addNotification(
    await translate(attachment.string.FilesNotAttached, { count: names.length }),
    await translate(attachment.string.FilesNotAttachedHint, { count: names.length, names: names.join(', ') }),
    SimpleNotification,
    undefined,
    NotificationSeverity.Warning
  )
}
