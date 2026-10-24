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

// Entry point of `@hcengineering/ui/kit`: the current base components that replace the legacy ones in ../components.

export { default as Button } from './button/Button.svelte'
export { default as IconButton } from './button/IconButton.svelte'
export { default as MenuButton } from './button/MenuButton.svelte'
export type {
  ButtonAttributes,
  ButtonEvents,
  ButtonKind,
  ButtonProps,
  ButtonShape,
  ButtonSize,
  ButtonType,
  IconButtonProps,
  MenuButtonEvents,
  MenuButtonProps
} from './button/types'

export { default as FileBadge } from './file/FileBadge.svelte'
export { default as FileCard } from './file/FileCard.svelte'
export { default as FileCover } from './file/FileCover.svelte'
export { default as FileImage } from './file/FileImage.svelte'
export { default as FileNoPreview } from './file/FileNoPreview.svelte'
export { default as FileTile } from './file/FileTile.svelte'
export { default as MediaToolbar } from './file/MediaToolbar.svelte'
export { default as PageThumb } from './file/PageThumb.svelte'
export { formatFileSize, formatMediaDuration } from './file/format'
export type { FileBadgeData, ImageSource } from './file/types'

export { default as AudioBar } from './audio/AudioBar.svelte'
export { default as AudioCard } from './audio/AudioCard.svelte'
export { default as AudioCover } from './audio/AudioCover.svelte'
export { default as VoiceRecorderBar } from './audio/VoiceRecorderBar.svelte'
export { sharedPlayback } from './audio/playback'
export type { Playback } from './audio/types'

export { default as LinkCard } from './link/LinkCard.svelte'
export { default as LinkCoverCard } from './link/LinkCoverCard.svelte'
export { default as SiteIcon } from './link/SiteIcon.svelte'
export { linkHref, linkTarget, openLink } from './link/link'

export { default as IconFileDownload } from './_icons/IconFileDownload.svelte'
export { default as IconOpenFile } from './_icons/IconOpenFile.svelte'
export { default as IconSaveFile } from './_icons/IconSaveFile.svelte'
export { default as IconZoomIn } from './_icons/IconZoomIn.svelte'
export { default as IconZoomOut } from './_icons/IconZoomOut.svelte'
