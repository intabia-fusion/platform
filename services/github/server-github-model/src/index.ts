//
// Copyright © 2023 Hardcore Engineering Inc.
//

import { type Builder } from '@intabiafusion/model'

import core from '@intabiafusion/core'
import serverCore from '@intabiafusion/server-core'
import serverGithub from '@intabiafusion/server-github'
import time from '@intabiafusion/time'
import tracker from '@intabiafusion/tracker'

export { serverGithubId } from '@intabiafusion/server-github'

export function createModel (builder: Builder): void {
  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverGithub.trigger.OnProjectChanges,
    isAsync: true
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverGithub.trigger.OnProjectRemove,
    txMatch: {
      _class: core.class.TxRemoveDoc,
      objectClass: tracker.class.Project
    }
  })

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverGithub.trigger.OnGithubBroadcast,
    isAsync: false
  })

  // We should skip activity github mixin stuff.
  builder.createDoc(time.class.TodoAutomationHelper, core.space.Model, {
    onDoneTester: serverGithub.functions.TodoDoneTester
  })
}
