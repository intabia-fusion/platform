//
// Copyright © 2023 Hardcore Engineering Inc.
//

import { loadMetadata } from '@intabiafusion/platform'
import training from '@intabiafusion/training'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
loadMetadata(training.icon, {
  Cancel: `${icons}#cancel`,
  Duplicate: `${icons}#duplicate`,
  Release: `${icons}#release`,
  Retry: `${icons}#retry`,
  Training: `${icons}#training`,
  TrainingApplication: `${icons}#training-application`,
  TrainingRequest: `${icons}#request`,
  TrainingAttempt: `${icons}#attempt`,
  ViewAllTrainings: `${icons}#training`,
  ViewIncomingRequests: `${icons}#view-incoming-requests`,
  ViewMyResults: `${icons}#view-my-results`,
  ViewMyTrainings: `${icons}#training-application`,
  ViewSentRequests: `${icons}#view-sent-requests`,
  ViewTraineesResults: `${icons}#attempt`
})
