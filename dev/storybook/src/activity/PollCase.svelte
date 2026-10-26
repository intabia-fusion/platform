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
  import activity, { type Poll } from '@hcengineering/activity'
  import PollPresenter from '@hcengineering/activity-resources/src/components/poll/PollPresenter.svelte'
  import { createQuery } from '@hcengineering/presentation'

  import { seed, setQuizAnswer } from './client'
  import { makePoll, type PollKind, type PollSituation } from './fixtures'

  export let kind: PollKind = 'poll'
  export let situation: PollSituation = 'open'

  const query = createQuery()
  let poll: Poll | undefined

  // From the store, as the chat gets it: a vote updates the poll through the live query.
  $: build(kind, situation)

  function build (...args: unknown[]): void {
    const made = makePoll({ kind, situation })
    if (made.quizAnswer != null) setQuizAnswer(made.poll._id, made.quizAnswer)
    seed(made.docs)
    query.query(activity.class.Poll, { _id: made.poll._id }, (res) => {
      poll = res[0]
    })
  }
</script>

<div class="poll-case">
  {#if poll != null}
    <PollPresenter instance={poll} />
  {/if}
</div>

<style lang="scss">
  .poll-case {
    width: 28rem;
    max-width: 100%;
  }
</style>
