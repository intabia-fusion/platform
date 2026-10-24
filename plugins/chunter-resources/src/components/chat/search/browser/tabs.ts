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

import attachment from '@hcengineering/attachment'
import type { IntlString } from '@hcengineering/platform'
import { IconLink, type IconComponent } from '@hcengineering/ui'

import { BrowserTab, type ContentTab } from '../../../../search/attachments'
import chunter from '../../../../plugin'
import IconMedia from '../../../icons/IconMedia.svelte'
import IconMic from '../../../icons/IconMic.svelte'

export interface TabConfig {
  icon: IconComponent
  label: IntlString
  placeholder: IntlString
}

export interface ContentTabConfig extends TabConfig {
  count: IntlString
  empty: IntlString
}

export const tabConfig: Record<BrowserTab.Messages, TabConfig> & Record<ContentTab, ContentTabConfig> = {
  [BrowserTab.Messages]: {
    icon: chunter.icon.Messages,
    label: chunter.string.Messages,
    placeholder: chunter.string.SearchPlaceholder
  },
  [BrowserTab.Media]: {
    icon: IconMedia,
    label: chunter.string.BrowserMedia,
    placeholder: chunter.string.SearchMediaPlaceholder,
    count: chunter.string.MediaCount,
    empty: chunter.string.NoMediaTitle
  },
  [BrowserTab.Files]: {
    icon: attachment.icon.FileBrowser,
    label: chunter.string.BrowserFiles,
    placeholder: chunter.string.SearchFilesPlaceholder,
    count: chunter.string.FilesCount,
    empty: chunter.string.NoFilesTitle
  },
  [BrowserTab.Links]: {
    icon: IconLink,
    label: chunter.string.BrowserLinks,
    placeholder: chunter.string.SearchLinksPlaceholder,
    count: chunter.string.LinksCount,
    empty: chunter.string.NoLinksTitle
  },
  [BrowserTab.Audio]: {
    icon: IconMic,
    label: chunter.string.BrowserAudio,
    placeholder: chunter.string.SearchAudioPlaceholder,
    count: chunter.string.AudioCount,
    empty: chunter.string.NoAudioTitle
  }
}
