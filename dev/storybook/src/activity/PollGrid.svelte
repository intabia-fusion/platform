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
  import InputStripCase from './InputStripCase.svelte'
  import PollCase from './PollCase.svelte'
  import type { PollKind, PollSituation } from './fixtures'

  const cases: Array<{ title: string, kind: PollKind, situation: PollSituation }> = [
    { title: 'Not started', kind: 'poll', situation: 'scheduled' },
    { title: 'Open', kind: 'poll', situation: 'open' },
    { title: 'Own vote', kind: 'poll', situation: 'voted' },
    { title: 'Ended', kind: 'poll', situation: 'ended' },
    { title: 'Multiple choice, own vote', kind: 'multiple', situation: 'voted' },
    { title: 'Anonymous, own vote', kind: 'anonymous', situation: 'voted' },
    { title: 'Quiz, open', kind: 'quiz', situation: 'open' },
    { title: 'Quiz, own wrong answer', kind: 'quiz', situation: 'voted' },
    { title: 'Quiz, ended', kind: 'quiz', situation: 'ended' }
  ]
</script>

<div class="poll-grid">
  {#each cases as { title, kind, situation }}
    <figure class="poll-grid__cell">
      <figcaption class="poll-grid__caption">{title}</figcaption>
      <PollCase {kind} {situation} />
    </figure>
  {/each}
  <figure class="poll-grid__cell poll-grid__wide">
    <figcaption class="poll-grid__caption">Drafts in the message input</figcaption>
    <InputStripCase />
  </figure>
</div>

<style lang="scss">
  .poll-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    align-items: start;
    gap: var(--spacing-2);

    &__cell {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin: 0;
      min-width: 0;
    }
    &__wide {
      grid-column: 1 / -1;
    }
    &__caption {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-dark-color);
    }
  }
</style>
