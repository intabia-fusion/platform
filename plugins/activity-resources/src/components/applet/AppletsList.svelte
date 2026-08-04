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
  import { getClient } from '@hcengineering/presentation'
  import { Component } from '@hcengineering/ui'

  export let value: WithLookup<ActivityMessage> | undefined = undefined
  export let applets: AppletInstance[] | undefined = undefined

  const client = getClient()

  function resolveApplets (msg?: WithLookup<ActivityMessage>, explicitApplets?: AppletInstance[]): AppletInstance[] {
    if (explicitApplets != null && explicitApplets.length > 0) {
      return explicitApplets
    }

    return (msg?.$lookup?.applets ?? []) as AppletInstance[]
  }

  function getAppletModel (appletId?: Ref<Applet>): Applet | undefined {
    if (appletId == null) return undefined
    return client.getModel().findAllSync(activity.class.Applet, { _id: appletId })[0]
  }

  $: appletInstances = resolveApplets(value, applets)
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
              applet: model
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
