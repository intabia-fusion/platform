//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2022, 2023, 2024 Hardcore Engineering Inc.
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
import textEditor from '@hcengineering/text-editor'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(textEditor.icon, {
  Header1: `${icons}#header1`,
  Header2: `${icons}#header2`,
  Header3: `${icons}#header3`,
  Underline: `${icons}#underline`,
  Strikethrough: `${icons}#strikethrough`,
  Bold: `${icons}#bold`,
  Italic: `${icons}#italic`,
  Link: `${uiIcons}#link`,
  ListNumber: `${icons}#listNumber`,
  ListBullet: `${uiIcons}#bullet-list`,
  ListTodo: `${icons}#listTodo`,
  Quote: `${icons}#quote`,
  Code: `${uiIcons}#code`,
  CodeBlock: `${icons}#codeBlock`,
  TableProps: `${icons}#tableProps`,
  AlignLeft: `${icons}#alignLeft`,
  AlignCenter: `${icons}#alignCenter`,
  AlignRight: `${icons}#alignRight`,
  MoreH: `${uiIcons}#dots-horizontal`,
  Expand: `${uiIcons}#open-file`,
  ScaleOut: `${uiIcons}#arrows-out`,
  Download: `${uiIcons}#download`,
  Note: `${icons}#note`,
  Comment: `${uiIcons}#bubbles`,
  SelectTable: `${uiIcons}#arrows-move`,
  MergeCells: `${icons}#union`,
  SplitCells: `${icons}#divide`,
  Brush: `${icons}#brush`,
  TextStyle: `${icons}#textStyle`,
  LinkPreview: `${uiIcons}#link`,
  Refresh: `${uiIcons}#arrows-clockwise`,
  ShowDiff: `${icons}#showDiff`,
  SeeOriginalData: `${uiIcons}#eye`,
  EmbedPreview: `${icons}#linkEmbed`
})
