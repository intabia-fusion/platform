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

import { activityId } from '@hcengineering/activity'
import PollPresenter from '@hcengineering/activity-resources/src/components/poll/PollPresenter.svelte'
import CreatePoll from '@hcengineering/activity-resources/src/components/poll/CreatePoll.svelte'
import PollPreview from '@hcengineering/activity-resources/src/components/poll/PollPreview.svelte'
import { createPoll, getPollTitle } from '@hcengineering/activity-resources/src/poll'
import { setCurrentEmployee, setCurrentEmployeeSpace } from '@hcengineering/contact'
import { AccountRole, setCurrentAccount } from '@hcengineering/core'
import { emojiId } from '@hcengineering/emoji'
import EmojiPopup from '@hcengineering/emoji-resources/src/components/EmojiPopup.svelte'
import { addLocation } from '@hcengineering/platform'
import { setClient } from '@hcengineering/presentation'
import registerPresentationStrings from '@hcengineering/presentation/src/lang'
import { Notifications } from '@hcengineering/ui'

// Icons and strings of the *-assets sources, as the workbench loads them; vite.config.mts turns their require into imports.
import '../../../../plugins/activity-assets/src/index'
import registerActivityStrings from '../../../../plugins/activity-assets/src/lang'
import '../../../../plugins/contact-assets/src/index'
import registerContactStrings from '../../../../plugins/contact-assets/src/lang'
import '../../../../plugins/emoji-assets/src/index'
import registerEmojiStrings from '../../../../plugins/emoji-assets/src/lang'
import '../../../../plugins/view-assets/src/index'
import registerViewStrings from '../../../../plugins/view-assets/src/lang'

import { createStoryClient, seed } from './client'
import { baseDocs, me } from './fixtures'

let ready: Promise<void> | undefined

// Once per preview document: every poll story shares the client and the viewer.
export async function setupActivity (): Promise<void> {
  ready ??= init()
  await ready
}

async function init (): Promise<void> {
  // Before setClient: the UI client takes the viewer's social id when it is built.
  setCurrentAccount({
    uuid: me.account,
    role: AccountRole.User,
    primarySocialId: me.socialId,
    socialIds: [me.socialId],
    fullSocialIds: []
  })
  setCurrentEmployee(me.person)
  setCurrentEmployeeSpace(me.space)

  registerPresentationStrings()
  registerActivityStrings()
  registerContactStrings()
  registerEmojiStrings()
  registerViewStrings()

  // Only what the poll asks by id, not the whole resources of these plugins.
  addLocation(activityId, async () => ({
    default: async () => ({
      component: { PollPresenter, CreatePoll, PollPreview },
      function: { GetPollTitleFn: getPollTitle, CreatePollFn: createPoll }
    })
  }))
  addLocation(emojiId, async () => ({ default: async () => ({ component: { EmojiPopup } }) }))

  // Toasts of the poll, such as a vote not counted, as the workbench hosts them.
  new Notifications({ target: document.body.appendChild(document.createElement('div')) }) // eslint-disable-line no-new

  // The employees query of contact-resources fills its stores from these on setClient.
  seed(baseDocs())
  await setClient(await createStoryClient())
}
