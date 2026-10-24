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

import { BrowserWindow, dialog, DownloadItem, OpenDialogOptions, WebContents } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

import { DownloadEntry } from '../ui/types'

const WAIT_TTL_MS = 60_000
// A file name holds 255 bytes; the rest is room for the `.crdownload` it is written as.
const MAX_NAME_BYTES = 240
const MAX_EXT_BYTES = 60
const FALLBACK_NAME = 'file'
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
const TRAILING_DOTS = /[. ]+$/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

interface Waiting {
  savePath: string
  timer: NodeJS.Timeout
}

/** Where each started download goes, by its address, until it reaches `will-download`. */
const waitingByUrl = new Map<string, Waiting>()
/** Paths still being written: the disk calls them free while they are a `.crdownload`. */
const pathsInUse = new Set<string>()

export async function downloadToFolder (sender: WebContents, files: DownloadEntry[]): Promise<void> {
  const folder = await pickFolder(sender)
  if (folder == null) return

  const namesInBatch = new Set<string>()
  for (const file of files) {
    // Already on its way: a duplicate in the batch, or the batch started twice.
    if (waitingByUrl.has(file.url)) continue
    const savePath = path.join(folder, freeName(folder, file.name, namesInBatch))
    reserve(file.url, savePath)
    sender.downloadURL(file.url)
  }
}

/** Must run inside `will-download`: a save path set later still shows the dialog. */
export function applyBatchSavePath (item: DownloadItem): void {
  // After a redirect the address we started with is only in the chain.
  for (const url of item.getURLChain()) {
    const waiting = waitingByUrl.get(url)
    if (waiting == null) continue
    clearTimeout(waiting.timer)
    waitingByUrl.delete(url)
    item.setSavePath(waiting.savePath)
    item.once('done', () => {
      release(waiting.savePath)
    })
    return
  }
}

async function pickFolder (sender: WebContents): Promise<string | undefined> {
  const window = BrowserWindow.fromWebContents(sender)
  const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
  const result = window != null ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

function reserve (url: string, savePath: string): void {
  pathsInUse.add(pathKey(savePath))
  // A download that never starts must not keep the name nor catch a later one of the same file.
  const timer = setTimeout(() => {
    waitingByUrl.delete(url)
    release(savePath)
  }, WAIT_TTL_MS)
  waitingByUrl.set(url, { savePath, timer })
}

function release (savePath: string): void {
  pathsInUse.delete(pathKey(savePath))
}

/** The name, or `name (1).ext`, `name (2).ext`… if it is on disk, being written or earlier in the batch. */
function freeName (folder: string, name: string, namesInBatch: Set<string>): string {
  const { base, ext } = splitName(safeName(name))
  const isFree = (candidate: string): boolean => {
    const full = path.join(folder, candidate)
    return !namesInBatch.has(pathKey(candidate)) && !pathsInUse.has(pathKey(full)) && !fs.existsSync(full)
  }

  let candidate = fitName(base, ext)
  for (let i = 1; !isFree(candidate); i++) {
    candidate = fitName(base, ` (${i})${ext}`)
  }
  namesInBatch.add(pathKey(candidate))
  return candidate
}

// Windows refuses these characters and reserved names, and drops a trailing dot or space.
function safeName (name: string): string {
  const cleaned = name.replace(FORBIDDEN_CHARS, '_').trim().replace(TRAILING_DOTS, '')
  if (cleaned === '') return FALLBACK_NAME
  // `con`, `con.txt` and `con.tar.gz` alike.
  const stem = cleaned.split('.')[0].trim()
  return WINDOWS_RESERVED.test(stem) ? `_${cleaned}` : cleaned
}

function splitName (name: string): { base: string, ext: string } {
  const ext = path.extname(name)
  // So long it is a part of the name with a dot in it.
  if (Buffer.byteLength(ext) > MAX_EXT_BYTES) return { base: name, ext: '' }
  return { base: name.slice(0, name.length - ext.length), ext }
}

/** Shortens the base, never the suffix and extension, to fit the disk. */
function fitName (base: string, tail: string): string {
  const chars = Array.from(base)
  while (chars.length > 0 && Buffer.byteLength(chars.join('') + tail) > MAX_NAME_BYTES) {
    chars.pop()
  }
  // Cut short, a name without an extension may end in a dot again.
  const head = tail === '' ? chars.join('').replace(TRAILING_DOTS, '') : chars.join('')
  return (head === '' ? FALLBACK_NAME : head) + tail
}

// The disks of macOS and Windows tell neither case nor composed and decomposed letters apart.
function pathKey (name: string): string {
  return name.normalize('NFC').toLowerCase()
}
