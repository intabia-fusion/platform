//
// Copyright © 2025 Hardcore Engineering Inc.
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

/** @public */
export type DownloadItemState = 'paused' | 'completed' | 'cancelled' | 'interrupted' | 'progressing'

/**
 * What came of an action on a finished download.
 *
 * `unknown` - a download id this session never completed: the renderer names a download by id, never by path, so a
 * random string tells it nothing about the disk. `unavailable` - the host has no bridge to the OS (a browser).
 * `cancelled` - the user dismissed the OS confirmation before opening a file of a type we do not know to be safe.
 *
 * @public
 */
export type DownloadActionStatus = 'ok' | 'missing' | 'failed' | 'unknown' | 'cancelled' | 'unavailable'

/**
 * Texts for the OS dialog shown before opening a file whose type is not known to be safe. The renderer translates
 * them (`plugin.string.*`), the main process only renders them: a native dialog cannot read our locale itself.
 *
 * @public
 */
export interface DownloadConfirmTexts {
  title: string
  message: string
  open: string
  cancel: string
}

/** @public */
export interface DownloadItem {
  key: string
  state: DownloadItemState
  fileName: string
  receivedBytes: number
  totalBytes: number
  url: string
  savePath: string
}
