//
// Copyright © 2023 Hardcore Engineering Inc.
//

import { loadMetadata } from '@hcengineering/platform'
import training from '@hcengineering/training'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(training.icon, {
  Cancel: `${uiIcons}#cross-circle`,
  Duplicate: `${uiIcons}#copy`,
  Release: `${uiIcons}#check-circle-fill`,
  Retry: `${uiIcons}#arrow-clockwise`,
  Training: `${uiIcons}#notebook-question`,
  TrainingApplication: `${uiIcons}#graduation-cap`,
  TrainingRequest: `${uiIcons}#notebook-arrows`,
  TrainingAttempt: `${uiIcons}#list-check`,
  ViewAllTrainings: `${uiIcons}#notebook-question`,
  ViewIncomingRequests: `${uiIcons}#tray`,
  ViewMyResults: `${icons}#chart-line-up`,
  ViewMyTrainings: `${uiIcons}#graduation-cap`,
  ViewSentRequests: `${uiIcons}#paper-plane-right`,
  ViewTraineesResults: `${uiIcons}#list-check`
})
