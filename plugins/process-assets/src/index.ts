//
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
//

import { loadMetadata } from '@hcengineering/platform'
import process from '@hcengineering/process'

// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(process.icon, {
  Process: `${uiIcons}#lightning`,
  States: `${uiIcons}#chart-square`,
  ToDo: `${uiIcons}#check-circle`,
  ToDoRemove: `${uiIcons}#cross-circle`,
  WaitSubprocesses: `${uiIcons}#layers`,
  Start: `${uiIcons}#paper-plane`,
  WhenCardMatches: `${uiIcons}#circle-gap-dot`,
  WhenFieldChanges: `${uiIcons}#pencil-fill`,
  Time: `${uiIcons}#clock`,
  OnEvent: `${uiIcons}#paper-plane`
})
