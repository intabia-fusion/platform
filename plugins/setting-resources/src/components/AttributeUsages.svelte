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
  import type { AnyAttribute } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import setting from '@hcengineering/setting'
  import { Component } from '@hcengineering/ui'

  export let attribute: AnyAttribute

  const client = getClient()
  // A front newer than the workspace model (dev-server over an older transactor) has no such class yet.
  const providers = client.getHierarchy().hasClass(setting.class.AttributeUsageProvider)
    ? client.getModel().findAllSync(setting.class.AttributeUsageProvider, {})
    : []
</script>

{#each providers as provider (provider._id)}
  <Component is={provider.component} props={{ attribute }} />
{/each}
