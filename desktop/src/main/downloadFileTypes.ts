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

// Types a click may open without asking. A list of dangerous ones always lags behind: a new or forgotten type would
// launch instead of asking, so everything not listed here is confirmed first.
//
// Left out on purpose: `svg` and `html` (may run script), `docm`/`xlsm`/`pptm` (macros), `rtf`, fonts, and anything
// the OS would execute. Archives are safe to open: they show their contents, nothing runs.
const SAFE_EXTENSIONS = new Set([
  // Documents
  'pdf',
  'txt',
  'csv',
  'log',
  'md',
  'json',
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  // Video and audio
  'mp4',
  'webm',
  'mov',
  'mkv',
  'avi',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
  // Office without macros
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  // Archives
  'zip',
  '7z',
  'rar',
  'tar',
  'gz'
])

/**
 * Whether the file may be opened without a confirmation. The last extension decides, so `report.pdf.exe` is `exe`;
 * a name without an extension, or one starting with a dot (`.bashrc`), is not safe.
 */
export function isSafeToOpen (fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 && SAFE_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase())
}
