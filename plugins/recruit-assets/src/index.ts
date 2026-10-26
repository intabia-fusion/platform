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
import recruit from '@hcengineering/recruit'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(recruit.icon, {
  RecruitApplication: `${uiIcons}#person-search`,
  Vacancy: `${uiIcons}#briefcase`,
  Location: `${uiIcons}#map-pin`,
  Calendar: `${uiIcons}#calendar`,
  Create: `${uiIcons}#document`,
  Application: `${uiIcons}#id-card`,
  Review: `${uiIcons}#bubbles-square`,
  Opinion: `${uiIcons}#bubble-person`,
  CreateCandidate: `${uiIcons}#pencil-square`,
  AssignedToMe: `${uiIcons}#check-square`,
  Reviews: `${icons}#reviews`,
  Skills: `${uiIcons}#graduation-cap`,
  Issue: `${icons}#circle-badge`,
  Schedule: `${uiIcons}#clock`,
  Talents: `${uiIcons}#people`,
  Applications: `${icons}#id-badge`
})
