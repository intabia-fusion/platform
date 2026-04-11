/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

import type { Class, Doc, PersonId, Ref, Timestamp } from '@hcengineering/core'
import type { Person } from '@hcengineering/contact'
import type { IntlString } from '@hcengineering/platform'

/** @public */
export interface DocumentPresence extends Doc {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  person: Ref<Person>
  lastActive: Timestamp
}

/** @public */
export interface TypingIndicator extends Doc {
  objectId: string
  socialId: PersonId
  status?: IntlString
}
