/**
  Copyright © 2026 Intabia Fusion.
  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  See https://www.eclipse.org/legal/epl-2.0
*/

import type { Class, Ref } from '@hcengineering/core'
import type { Plugin } from '@hcengineering/platform'
import { plugin } from '@hcengineering/platform'
import type { DocumentPresence, TypingIndicator } from './types'

/** @public */
export const pulseId = 'pulse' as Plugin

/** @public */
const pulsePlugin = plugin(pulseId, {
  class: {
    DocumentPresence: '' as Ref<Class<DocumentPresence>>,
    TypingIndicator: '' as Ref<Class<TypingIndicator>>
  }
})

export default pulsePlugin
