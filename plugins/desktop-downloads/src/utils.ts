//
// Copyright © 2025 Hardcore Engineering Inc.
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
import { type DownloadActionStatus, type DownloadConfirmTexts, type DownloadItem } from './types'
import plugin from './plugin'

/** @public */
export async function handleDownloadItem (item: DownloadItem): Promise<void> {
  const fn = await getResource(plugin.function.HandleDownloadItem)
  fn(item)
}

/** @public */
export type DownloadItemAction = (key: string) => Promise<DownloadActionStatus>

/** @public */
export type OpenDownloadItemAction = (key: string, confirm: DownloadConfirmTexts) => Promise<DownloadActionStatus>

/** What the host does with a finished download, by the id it was given with the download. */
export interface DownloadItemActions {
  reveal: DownloadItemAction
  open: OpenDownloadItemAction
}

let actions: DownloadItemActions | undefined

/**
 * Called once by the desktop renderer (`desktop/src/ui/index.ts`), the only side that holds the bridge to the main
 * process: the plugin itself never talks to the OS.
 *
 * @public
 */
export function setDownloadItemActions (value: DownloadItemActions | undefined): void {
  actions = value
}

/** Selects the finished download in the OS file manager. @public */
export async function revealDownloadItem (key: string): Promise<DownloadActionStatus> {
  return actions !== undefined ? await actions.reveal(key) : 'unavailable'
}

/**
 * Opens the finished download with the application the OS associates with it. A type the app does not know to be
 * safe is confirmed by the OS dialog first, with the given texts.
 *
 * @public
 */
export async function openDownloadItem (key: string, confirm: DownloadConfirmTexts): Promise<DownloadActionStatus> {
  return actions !== undefined ? await actions.open(key, confirm) : 'unavailable'
}
