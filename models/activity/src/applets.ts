//
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

import activity from '@hcengineering/activity'
import core from '@hcengineering/core'
import { type Builder } from '@hcengineering/model'

export function buildApplets (builder: Builder): void {
  builder.createDoc(
    activity.class.Applet,
    core.space.Model,
    {
      label: activity.string.Poll,
      pluralLabel: activity.string.Polls,
      icon: activity.icon.Poll,
      component: activity.component.PollPresenter,
      createLabel: activity.string.CreatePoll,
      editLabel: activity.string.EditPoll,
      createComponent: activity.component.CreatePoll,
      previewComponent: activity.component.PollPreview,
      getTitleFn: activity.function.GetPollTitleFn,
      createFn: activity.function.CreatePollFn,
      // Votes may already count for the options of a sent poll.
      editable: false
    },
    activity.applet.Poll
  )
}
