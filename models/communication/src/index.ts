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

import { type Builder } from '@hcengineering/model'
import contact from '@hcengineering/contact'
import card from '@hcengineering/card'

import communication from './plugin'
import { buildTypes } from './types'
import { buildCardActions, buildMessageActions } from './actions'
import { buildApplets } from './applets'
import { buildActivity } from './activity'
import { markClassMessageable } from './utils'

export { communicationId } from '@hcengineering/communication'
export { markClassMessageable } from './utils'
export * from './migration'

export function createModel (builder: Builder): void {
  buildTypes(builder)

  buildActivity(builder)

  buildMessageActions(builder)
  buildCardActions(builder)
  buildApplets(builder)

  markClassMessageable(builder, card.class.Card)
  markClassMessageable(builder, contact.class.Contact)
  markClassMessageable(builder, contact.class.Channel)
}

export default communication
