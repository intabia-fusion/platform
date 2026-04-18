//
// Copyright © 2025 Hardcore Engineering Inc.
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

import core from '@intabiafusion/core'
import { type Builder } from '@intabiafusion/model'
import contact from '@intabiafusion/contact'
import presentation from '@intabiafusion/model-presentation'

import achievement from './plugin'

export { default } from './plugin'
export { achievementId } from '@intabiafusion/achievement'

export function createModel (builder: Builder): void {
  builder.createDoc(
    presentation.class.ComponentPointExtension,
    core.space.Model,
    {
      extension: contact.extension.PersonAchievementsPresenter,
      component: achievement.component.PersonAchievementsPresenter,
      props: {}
    },
    achievement.extensions.PersonAchievementsPresenter
  )
}
