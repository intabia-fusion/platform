//
// Copyright © 2024 Hardcore Engineering Inc.
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
import documents from '@hcengineering/controlled-documents'
import { loadMetadata } from '@hcengineering/platform'

// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(documents.icon, {
  Approvals: `${uiIcons}#list-check`,
  DocumentApplication: `${uiIcons}#clipboard`,
  NewDocument: `${uiIcons}#pencil-square`,
  Folder: `${uiIcons}#folder`,
  Document: `${uiIcons}#files`,
  Library: `${uiIcons}#books`,
  StateEffective: `${uiIcons}#check-circle-fill`,
  StateRejected: `${uiIcons}#cross-circle-fill`,
  StateObsolete: `${uiIcons}#cross-circle-fill`,
  ArrowUp: `${uiIcons}#arrow-up`,
  ArrowDown: `${uiIcons}#arrow-down`,
  Configure: `${uiIcons}#sliders`
})
