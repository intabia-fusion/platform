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

import testManagement from '@hcengineering/test-management'
import { loadMetadata } from '@hcengineering/platform'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(testManagement.icon, {
  TestCase: `${uiIcons}#document`,
  TestManagementApplication: `${uiIcons}#hierarchy`,
  TestManagement: `${uiIcons}#document`,
  TestManagementVersion: `${uiIcons}#document`,
  TestCases: `${uiIcons}#document`,
  Home: `${uiIcons}#house-fill`,
  Estimation: `${uiIcons}#document`,
  TestSuite: `${uiIcons}#folder-tab`,
  TestProject: `${uiIcons}#briefcase`,
  TestSuites: `${uiIcons}#folder-tab`,
  TestRuns: `${uiIcons}#briefcase-play`,
  RedCircle: `${icons}#red-circle`,
  Document: `${uiIcons}#document`,
  StatusDraft: `${icons}#status-draft`,
  StatusReview: `${icons}#status-review`,
  StatusReviewComments: `${icons}#status-review-comments`,
  StatusApproved: `${icons}#status-approved`,
  StatusRejected: `${icons}#status-canceled`,
  TestLibrary: `${uiIcons}#books`,
  TestResult: `${uiIcons}#list-check`,
  StatusNonTested: `${icons}#status-untested`,
  StatusBlocked: `${icons}#status-blocked`,
  StatusPassed: `${uiIcons}#check-circle-fill`,
  StatusFailed: `${uiIcons}#cross-circle-fill`,
  Run: `${uiIcons}#play-fill`,
  TestPlans: `${uiIcons}#clipboard`
})
