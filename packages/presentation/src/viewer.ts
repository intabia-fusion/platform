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

import { showPopup, type PopupResult } from '@hcengineering/ui'
import type { ComponentProps } from 'svelte'

import FileViewer from './components/viewer/FileViewer.svelte'

export type FileViewerProps = Omit<ComponentProps<FileViewer>, 'fullSize' | 'fullWindow'>

export function showFileViewer (params: FileViewerProps, onClose?: (result: any) => void): PopupResult {
  return showPopup(FileViewer, { ...params, fullSize: true, fullWindow: true }, 'centered', onClose)
}
