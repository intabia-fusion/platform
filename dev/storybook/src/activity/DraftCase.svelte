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
  import activity, { type AppletDraft, type CreatePollParams } from '@hcengineering/activity'
  import AppletPreview from '@hcengineering/activity-resources/src/components/input/AppletPreview.svelte'
  import { generateId } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'

  import { defaultLabels } from './fixtures'

  export let draft: 'poll' | 'quiz' = 'poll'

  const model = getClient().getModel().findObject(activity.applet.Poll)

  function makeParams (kind: typeof draft): CreatePollParams {
    const options = defaultLabels.map((label, index) => ({ id: `o${index}`, label }))
    return {
      question: kind === 'quiz' ? 'Which dish is Japanese?' : 'What shall we order for lunch?',
      options,
      mode: 'single',
      quiz: kind === 'quiz',
      quizAnswer: kind === 'quiz' ? 'o1' : undefined
    }
  }

  let deleted = false
  let applet: AppletDraft<CreatePollParams>
  $: applet = { id: generateId(), appletId: activity.applet.Poll, params: makeParams(draft) }

  function edit (params: AppletDraft['params']): void {
    applet = { ...applet, params: params as CreatePollParams }
  }
</script>

{#if model != null && !deleted}
  <AppletPreview
    {applet}
    {model}
    on:change={(event) => {
      edit(event.detail)
    }}
    on:delete={() => {
      deleted = true
    }}
  />
{/if}
