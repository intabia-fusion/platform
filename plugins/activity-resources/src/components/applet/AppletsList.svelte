<!--
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
-->

<script lang="ts">
  import activity, { type ActivityMessage, type Applet, type AppletInstance } from '@hcengineering/activity'
  import type { Ref, WithLookup } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Component } from '@hcengineering/ui'

  export let value: WithLookup<ActivityMessage> | undefined = undefined
  export let applets: AppletInstance[] | undefined = undefined
  export let readonly: boolean = false
  // Shown read-only when the message has applets this viewer cannot get, e.g. a forwarded original from a closed space.
  export let fallback: AppletInstance[] = []

  const client = getClient()
  const query = createQuery()

  let queried: AppletInstance[] = []
  let queriedFor: Ref<ActivityMessage> | undefined = undefined

  $: lookupApplets = value?.$lookup?.applets as AppletInstance[] | undefined
  // Many views load messages without the applets lookup (threads, saved, pinned, popups).
  $: needQuery = applets === undefined && lookupApplets === undefined && (value?.applets ?? 0) > 0
  $: if (needQuery && value !== undefined) {
    const messageId = value._id
    query.query(activity.class.AppletInstance, { attachedTo: messageId }, (res) => {
      queried = res
      queriedFor = messageId
    })
  } else {
    query.unsubscribe()
    queried = []
    queriedFor = undefined
  }

  // The counter comes with the message, the applets with a space check: a viewer may get the count only.
  $: ownLoaded = lookupApplets ?? (queriedFor === value?._id ? queried : undefined)
  $: useFallback = applets === undefined && (value?.applets ?? 0) > 0 && ownLoaded?.length === 0 && fallback.length > 0

  $: appletInstances = useFallback ? fallback : (applets ?? lookupApplets ?? queried)

  function getAppletModel (appletId?: Ref<Applet>): Applet | undefined {
    if (appletId == null) return undefined
    return client.getModel().findAllSync(activity.class.Applet, { _id: appletId })[0]
  }
</script>

{#if appletInstances.length > 0}
  <div class="applets-container">
    {#each appletInstances as instance (instance._id)}
      {@const model = getAppletModel(instance.applet)}
      {#if model?.component}
        <div class="applet-item">
          <Component
            is={model.component}
            props={{
              instance,
              readonly: readonly || useFallback
            }}
          />
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style lang="scss">
  .applets-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .applet-item {
    display: flex;
    width: 100%;
  }
</style>
