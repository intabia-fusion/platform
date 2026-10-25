//
// Copyright @ 2024 Hardcore Engineering Inc.
//

import { loadMetadata } from '@hcengineering/platform'
import questions from '@hcengineering/questions'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(questions.icon, {
  ArrowDown: `${uiIcons}#arrow-down`,
  ArrowUp: `${uiIcons}#arrow-up`,
  Assessment: `${uiIcons}#check-circle`,
  Drag: `${uiIcons}#grip-vertical`,
  Duplicate: `${uiIcons}#copy`,
  Failed: `${uiIcons}#cross-circle-fill`,
  MiniDrag: `${uiIcons}#dots-six-vertical`,
  Passed: `${uiIcons}#check-circle-fill`,
  Question: `${uiIcons}#question-circle`,
  RadioButton: `${icons}#dot`
})
