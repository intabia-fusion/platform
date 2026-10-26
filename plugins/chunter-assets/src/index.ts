//
// Copyright © 2020 Anticrm Platform Contributors.
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

import chunter from '@hcengineering/chunter'
import { loadMetadata } from '@hcengineering/platform'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(chunter.icon, {
  Chunter: `${uiIcons}#bubble`,
  Hashtag: `${uiIcons}#hash`,
  Thread: `${uiIcons}#bubbles`,
  Lock: `${uiIcons}#lock`,
  ChannelBrowser: `${icons}#hash-search`,
  ChunterBrowser: `${uiIcons}#database-search`,
  Copy: `${uiIcons}#copy`,
  Messages: `${uiIcons}#bubbles`,
  Bookmarks: `${uiIcons}#bookmarks`,
  Report: `${uiIcons}#exclamation-circle`,
  Download: `${uiIcons}#download`
})
