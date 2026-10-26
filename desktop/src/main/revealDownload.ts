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

import { BrowserWindow, dialog, shell, type MessageBoxOptions } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

import type { DownloadActionStatus, DownloadConfirmTexts } from '@hcengineering/desktop-downloads'
import { isSafeToOpen } from './downloadFileTypes'

// Only downloads this app finished are reachable: the renderer names one by the id it got with the download, never by
// a path. The map lives as long as the window does, like the popup list in the renderer - nothing to look up after a
// restart, because the list is empty then too.
const completed = new Map<string, string>()

/** Remembers a download that finished, so the renderer may show or open it. Called from `will-download`'s `done`. */
export function rememberDownload (key: string, savePath: string): void {
  if (key === '' || savePath === '') return
  completed.set(key, savePath)
}

// `undefined` for an id we never completed, even when a file of that name exists: a random string must not tell the
// caller anything about the disk.
function completedPath (key: unknown): string | undefined {
  return typeof key === 'string' ? completed.get(key) : undefined
}

/** Shows the finished download in the OS file manager, selected. */
export function revealDownload (key: unknown): DownloadActionStatus {
  const savePath = completedPath(key)
  if (savePath === undefined) return 'unknown'
  if (!fs.existsSync(savePath)) return 'missing'

  // On Linux the selection goes through org.freedesktop.FileManager1 over DBus: with no session bus the call
  // is a silent no-op and says nothing back, so opening the folder is at least somewhere to start.
  if (process.platform === 'linux' && (process.env.DBUS_SESSION_BUS_ADDRESS ?? '') === '') {
    void shell.openPath(path.dirname(savePath))
    return 'ok'
  }

  shell.showItemInFolder(savePath)
  return 'ok'
}

/**
 * Opens the finished download with the application the OS associates with it.
 *
 * The type decides whether a click is enough: `isSafeToOpen` is the list of types that only display something. The
 * rest - an executable, a macro document, anything unknown - is confirmed by the OS dialog first, and the check runs
 * here, not in the popup, so a call from the renderer cannot skip it.
 */
export async function openDownload (
  key: unknown,
  confirm: DownloadConfirmTexts,
  parent?: BrowserWindow
): Promise<DownloadActionStatus> {
  const savePath = completedPath(key)
  if (savePath === undefined) return 'unknown'
  if (!fs.existsSync(savePath)) return 'missing'

  if (!isSafeToOpen(path.basename(savePath)) && !(await confirmOpen(parent, confirm, path.basename(savePath)))) {
    return 'cancelled'
  }

  const error = await shell.openPath(savePath)
  if (error !== '') {
    console.error('Failed to open the downloaded file', error)
    return 'failed'
  }
  return 'ok'
}

// Cancel is the default button: a file we do not know is one keypress away from running only by a deliberate choice.
async function confirmOpen (
  parent: BrowserWindow | undefined,
  texts: DownloadConfirmTexts,
  fileName: string
): Promise<boolean> {
  const options: MessageBoxOptions = {
    type: 'warning',
    title: texts.title,
    message: texts.message,
    detail: fileName,
    buttons: [texts.open, texts.cancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const { response } =
    parent !== undefined ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  return response === 0
}
