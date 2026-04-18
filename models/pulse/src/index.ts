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

import type { Person } from '@intabiafusion/contact'
import { DOMAIN_TRANSIENT, type Class, type Doc, type PersonId, type Ref, type Timestamp } from '@intabiafusion/core'
import { Model, type Builder } from '@intabiafusion/model'
import core, { TDoc } from '@intabiafusion/model-core'
import type { IntlString } from '@intabiafusion/platform'
import type { DocumentPresence, TypingIndicator } from '@intabiafusion/pulse'
import pulse from './plugin'

export { pulseId } from '@intabiafusion/pulse'

@Model(pulse.class.DocumentPresence, core.class.Doc, DOMAIN_TRANSIENT)
export class TDocumentPresence extends TDoc implements DocumentPresence {
  objectId!: Ref<Doc>
  objectClass!: Ref<Class<Doc>>
  person!: Ref<Person>
  lastActive!: Timestamp
}

@Model(pulse.class.TypingIndicator, core.class.Doc, DOMAIN_TRANSIENT)
export class TTypingIndicator extends TDoc implements TypingIndicator {
  objectId!: string
  socialId!: PersonId
  status?: IntlString
}

export function createModel (builder: Builder): void {
  builder.createModel(TDocumentPresence, TTypingIndicator)

  builder.mixin(pulse.class.DocumentPresence, core.class.Class, core.mixin.TransientTTL, {
    ttl: 10
  })

  builder.mixin(pulse.class.TypingIndicator, core.class.Class, core.mixin.TransientTTL, {
    ttl: 3
  })
}
