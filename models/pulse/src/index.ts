/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

import type { Person } from '@hcengineering/contact'
import { DOMAIN_TRANSIENT, type Class, type Doc, type PersonId, type Ref, type Timestamp } from '@hcengineering/core'
import { Model, type Builder } from '@hcengineering/model'
import core, { TDoc } from '@hcengineering/model-core'
import type { IntlString } from '@hcengineering/platform'
import type { DocumentPresence, TypingIndicator } from '@hcengineering/pulse'
import pulse from './plugin'

export { pulseId } from '@hcengineering/pulse'

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
