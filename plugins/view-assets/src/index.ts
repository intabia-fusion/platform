//
// Copyright © 2020 Anticrm Platform Contributors.
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

import { loadMetadata } from '@hcengineering/platform'
import core from '@hcengineering/core'
import view from '@hcengineering/view'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(view.icon, {
  Table: `${uiIcons}#table`,
  List: `${uiIcons}#bullet-list`,
  Delete: `${uiIcons}#trash`,
  Move: `${uiIcons}#arrows-move`,
  MoreH: `${uiIcons}#dots-horizontal`,
  Archive: `${uiIcons}#archive`,
  Statuses: `${uiIcons}#circle-gap-dot`,
  Open: `${uiIcons}#open-file`,
  Edit: `${uiIcons}#pencil-line`,
  CopyId: `${uiIcons}#clipboard`,
  CopyLink: `${uiIcons}#link`,
  Setting: `${uiIcons}#gear`,
  ArrowRight: `${uiIcons}#arrow-right`,
  Views: `${uiIcons}#layers-fill`,
  Pin: `${uiIcons}#push-pin`,
  Model: `${uiIcons}#hierarchy`,
  DevModel: `${uiIcons}#code`,
  Filter: `${uiIcons}#funnel`,
  Configure: `${uiIcons}#sliders-horizontal`,
  Star: `${uiIcons}#star`,
  Eye: `${uiIcons}#eye`,
  EyeCrossed: `${uiIcons}#eye-slash`,
  Bubble: `${uiIcons}#bubble`,
  CheckCircle: `${uiIcons}#check-circle`,
  Add: `${uiIcons}#plus`,
  Image: `${uiIcons}#image`,
  Table2: `${uiIcons}#table-cells`,
  CodeBlock: `${icons}#code-square`,
  MarkdownSource: `${icons}#code-slash`,
  SeparatorLine: `${uiIcons}#separator`,
  TodoList: `${uiIcons}#check-square`,
  Circle: `${uiIcons}#circle`,
  Join: `${uiIcons}#arrow-in`,
  Leave: `${uiIcons}#arrow-out`,
  Copy: `${uiIcons}#copy`,
  DetailsFilled: `${uiIcons}#panel-right-fill`,
  OpenInNewTab: `${uiIcons}#arrow-square-out`,
  Sidebar: `${uiIcons}#arrow-in-square`,
  Translate: `${uiIcons}#translate`,
  Undo: `${uiIcons}#arrow-uturn-left`,
  Video: `${uiIcons}#file-play`,
  Audio: `${uiIcons}#file-play`,
  File: `${uiIcons}#document`,
  PinTack: `${uiIcons}#push-pin-fill`,
  Feather: `${uiIcons}#feather`,
  MasterDetail: `${uiIcons}#panel-left`,
  Tree: `${icons}#tree`,
  Document: `${icons}#document`,
  Print: `${uiIcons}#document`,
  AiStar: `${uiIcons}#sparkle`
})
loadMetadata(core.icon, {
  TypeString: `${uiIcons}#separator`,
  TypeBlob: `${uiIcons}#file`,
  TypeHyperlink: `${uiIcons}#link`,
  TypeNumber: `${uiIcons}#hash`,
  TypeMarkup: `${uiIcons}#document`,
  TypeRank: `${uiIcons}#arrow-up-lines`,
  TypeRecord: `${uiIcons}#hierarchy`,
  TypeBoolean: `${uiIcons}#check-circle`,
  TypeDate: `${uiIcons}#calendar`,
  TypeRef: `${uiIcons}#link`,
  TypeArray: `${uiIcons}#bullet-list`,
  TypeEnumOf: `${uiIcons}#bullet-list`,
  TypeCollection: `${uiIcons}#copy`,
  TypePersonId: `${uiIcons}#person-circle`,
  Status: `${uiIcons}#circle-quarters`,
  Time: `${uiIcons}#clock`
})
