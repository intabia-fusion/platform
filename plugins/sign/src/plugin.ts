//
// Copyright © 2024 Hardcore Engineering Inc.
//

import { type Plugin, plugin, Metadata } from '@intabiafusion/platform'

export const signId = 'sign' as Plugin

export const sign = plugin(signId, {
  metadata: {
    SignURL: '' as Metadata<string>
  }
})

export default sign
