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

import core, { ClassifierKind } from '@intabiafusion/core'
import { type Builder } from '@intabiafusion/model'
import chat from '@intabiafusion/chat'

import card from '@intabiafusion/card'
import mail from '@intabiafusion/mail'

export { mailId } from '@intabiafusion/mail'

export function createModel (builder: Builder): void {
  // Create mail tags for Thread and Channel master tags
  builder.createDoc(
    card.class.Tag,
    core.space.Model,
    {
      extends: chat.masterTag.Thread,
      label: mail.string.MailTag,
      kind: ClassifierKind.MIXIN,
      icon: mail.icon.Mail
    },
    mail.tag.MailThread
  )
}
