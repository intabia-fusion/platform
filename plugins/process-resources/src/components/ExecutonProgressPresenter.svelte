<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { Ref } from '@intabiafusion/core'
  import { getClient } from '@intabiafusion/presentation'
  import { Label } from '@intabiafusion/ui'
  import { State } from '@intabiafusion/process'
  import plugin from '../plugin'

  export let value: Ref<State>

  const client = getClient()

  $: currentState = client.getModel().findObject(value)
</script>

{#if currentState}
  {currentState.title}
{:else if value === null}
  <span class="opacity-50"><Label label={plugin.string.Started} /></span>
{/if}
