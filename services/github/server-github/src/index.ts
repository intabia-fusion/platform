//
// Copyright © 2021, 2023 Hardcore Engineering Inc.
//
//

import { Ref } from '@intabiafusion/core'
import type { Metadata, Plugin, Resource } from '@intabiafusion/platform'
import { plugin } from '@intabiafusion/platform'
import { TriggerFunc } from '@intabiafusion/server-core'
import { TodoDoneTester } from '@intabiafusion/time'
import { GithubProject } from '@intabiafusion/github'

/**
 * @public
 */
export const serverGithubId = 'server-github' as Plugin

/**
 * @public
 */
export default plugin(serverGithubId, {
  trigger: {
    OnProjectChanges: '' as Resource<TriggerFunc>,
    OnProjectRemove: '' as Resource<TriggerFunc>,
    OnGithubBroadcast: '' as Resource<TriggerFunc>
  },
  functions: {
    TodoDoneTester: '' as Resource<TodoDoneTester>
  },
  metadata: {
    GithubProjects: '' as Metadata<Set<Ref<GithubProject>>>
  }
})
