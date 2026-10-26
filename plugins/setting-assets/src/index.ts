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
import setting from '@hcengineering/setting'

// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(setting.icon, {
  AccountSettings: `${uiIcons}#person`,
  Members: `${uiIcons}#people`,
  Password: `${uiIcons}#key`,
  Setting: `${uiIcons}#gear`,
  Integrations: `${uiIcons}#cube`,
  Support: `${uiIcons}#question-circle`,
  Privacy: `${uiIcons}#shield-half`,
  Terms: `${uiIcons}#document`,
  Signout: `${uiIcons}#arrow-out`,
  SelectWorkspace: `${uiIcons}#arrow-in`,
  Clazz: `${uiIcons}#code`,
  Enums: `${uiIcons}#bullet-list`,
  InviteSettings: `${uiIcons}#envelope`,
  InviteWorkspace: `${uiIcons}#person-plus`,
  Views: `${uiIcons}#layers-fill`,
  Relations: `${uiIcons}#arrows-horizontal`,
  Mailbox: `${uiIcons}#mailbox`,
  OfficeSettings: `${uiIcons}#building`,
  Reset: `${uiIcons}#arrows-clockwise`
})
