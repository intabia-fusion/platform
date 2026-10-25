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

import { loadMetadata } from '@hcengineering/platform'
import card from '@hcengineering/card'

// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(card.icon, {
  MasterTags: `${uiIcons}#bullet-list`,
  MasterTag: `${uiIcons}#hash`,
  Tags: `${uiIcons}#bullet-list`,
  Tag: `${uiIcons}#check-circle`,
  Card: `${uiIcons}#panel-right`,
  File: `${uiIcons}#file`,
  View: `${uiIcons}#table`,
  Document: `${uiIcons}#document`,
  Home: `${uiIcons}#house`,
  Space: `${uiIcons}#folder`,
  Expand: `${uiIcons}#open-file`,
  Feed: `${uiIcons}#text-align-left`,
  All: `${uiIcons}#layers`,
  Duplicate: `${uiIcons}#copy`,
  Lock: `${uiIcons}#lock-fill`,
  Grid: `${uiIcons}#grid`
})
