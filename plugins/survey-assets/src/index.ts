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

import { loadMetadata } from '@hcengineering/platform'
import survey from '@hcengineering/survey'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(survey.icon, {
  Application: `${uiIcons}#pencil-line`,
  Info: `${uiIcons}#info-circle`,
  Poll: `${icons}#poll`,
  Question: `${icons}#question`,
  QuestionKindString: `${icons}#textbox`,
  QuestionKindOption: `${uiIcons}#circle-dot`,
  QuestionKindOptions: `${uiIcons}#check-square`,
  Survey: `${uiIcons}#list-squares`,
  Submit: `${uiIcons}#check-square`,
  QuestionIsMandatory: `${icons}#asterisk`,
  QuestionHasCustomOption: `${uiIcons}#star`,
  ValidateFail: `${uiIcons}#exclamation-circle`
})
