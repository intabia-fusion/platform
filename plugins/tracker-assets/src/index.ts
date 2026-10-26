//
// Copyright © 2022 Hardcore Engineering Inc.
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
import tracker from '@hcengineering/tracker'

const icons = require('../assets/icons.svg') as string // eslint-disable-line
// Icons the kit has: the ids stay, stored documents keep pointing at them.
const uiIcons = require('@hcengineering/ui/assets/icons.svg') as string // eslint-disable-line
loadMetadata(tracker.icon, {
  TrackerApplication: `${uiIcons}#check-square`,
  Component: `${uiIcons}#diamond`,
  Issue: `${uiIcons}#check-square`,
  Subissue: `${icons}#sub-issue`,
  Relations: `${uiIcons}#arrows-left-right`,
  MyIssues: `${uiIcons}#crosshair`,
  Views: `${uiIcons}#layers-fill`,
  Issues: `${uiIcons}#check-square`,
  Components: `${uiIcons}#diamond`,
  NewIssue: `${uiIcons}#pencil-line`,
  Home: `${uiIcons}#house-fill`,
  // Unused in code, but projects may still store it: the project icon picker offered it in 2023-2025.
  RedCircle: `${icons}#red-circle`,
  Labels: `${uiIcons}#tags`,
  DueDate: `${uiIcons}#clock`,
  Parent: `${icons}#parent-issue`, // TODO: add icon
  UnsetParent: `${icons}#unset-parent-issue`,
  Milestone: `${uiIcons}#signpost`,
  IssueTemplates: `${uiIcons}#layout`,
  Start: `${uiIcons}#play-fill`,
  Stop: `${uiIcons}#square-fill`,

  CategoryBacklog: `${uiIcons}#circle-quarters`,
  CategoryCompleted: `${uiIcons}#check-circle-fill`,
  CategoryCanceled: `${uiIcons}#cross-circle-fill`,
  PriorityNoPriority: `${icons}#priority-nopriority`,
  PriorityUrgent: `${icons}#priority-urgent`,
  PriorityHigh: `${icons}#priority-high`,
  PriorityMedium: `${icons}#priority-medium`,
  PriorityLow: `${icons}#priority-low`,
  Priority: `${icons}#priority`,

  MilestoneStatusPlanned: `${icons}#component-status-planned`,
  MilestoneStatusInProgress: `${icons}#component-status-in-progress`,
  MilestoneStatusCompleted: `${icons}#component-status-completed`,
  MilestoneStatusCanceled: `${icons}#component-status-canceled`,

  CopyBranch: `${uiIcons}#text-aa-square`,
  Duplicate: `${uiIcons}#copy-plus`,
  TimeReport: `${uiIcons}#clock`,
  Estimation: `${uiIcons}#circle-half-fill`,
  Export: `${uiIcons}#cloud-download`,
  More: `${uiIcons}#dots-horizontal`,
  TimeReportDay: `${icons}#person-clock`
})
