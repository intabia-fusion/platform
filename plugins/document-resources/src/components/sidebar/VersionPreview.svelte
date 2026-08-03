<!--
//
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
//
-->
<script lang="ts">
  import { type DocumentVersion } from '@hcengineering/collaborator-client'
  import { areEqualJson, type MarkupNode } from '@hcengineering/text'
  import { MarkupDiffViewer } from '@hcengineering/text-editor-resources'
  import { translate } from '@hcengineering/platform'
  import { Card } from '@hcengineering/presentation'
  import { Button, DropdownLabels, type DropdownTextItem, Label, Loading, TimeSince } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import document from '../../plugin'

  export let version: DocumentVersion
  export let content: MarkupNode
  export let versions: DocumentVersion[] = []
  export let getCurrent: () => Promise<MarkupNode>
  export let readonly: boolean = false
  export let loadVersion: (version: DocumentVersion) => Promise<MarkupNode>

  const NONE = '-'
  const CURRENT = 'current'

  const dispatch = createEventDispatcher()

  let compareWith: string = NONE
  let baseline: MarkupNode | undefined
  let loadingBaseline = false

  $: index = versions.findIndex((v) => v.blobId === version.blobId)
  $: number = index >= 0 ? versions.length - index : 0

  let items: DropdownTextItem[] = []
  // guards against an earlier async build resolving after a later one.
  // plain object: a bare `let` unused in markup gets optimised away by the compiler
  const itemsSeq = { n: 0 }

  $: void buildItems(index, versions)

  async function buildItems (idx: number, list: DocumentVersion[]): Promise<void> {
    const seq = ++itemsSeq.n
    const [none, currentLabel] = await Promise.all([
      translate(document.string.NoComparison, {}),
      translate(document.string.CurrentVersion, {})
    ])
    if (seq !== itemsSeq.n) return

    items = [
      { id: NONE, label: none },
      { id: CURRENT, label: currentLabel },
      // any other version can serve as a baseline, not just older ones
      ...list
        .filter((_, i) => i !== idx)
        .map((v, i) => ({ id: v.blobId, label: `#${list.length - (i < idx ? i : i + 1)}` }))
    ]
  }

  $: void updateBaseline(compareWith)

  async function updateBaseline (id: string): Promise<void> {
    if (id === NONE) {
      baseline = undefined
      return
    }
    if (id === CURRENT) {
      loadingBaseline = true
      try {
        const node = await getCurrent()
        if (compareWith === id) {
          baseline = node
        }
      } finally {
        loadingBaseline = false
      }
      return
    }

    const target = versions.find((v) => v.blobId === id)
    if (target === undefined) {
      baseline = undefined
      return
    }

    loadingBaseline = true
    try {
      const node = await loadVersion(target)
      // a later selection may have won while we were fetching
      if (compareWith === id) {
        baseline = node
      }
    } finally {
      loadingBaseline = false
    }
  }
</script>

<Card
  label={document.string.PreviewVersion}
  okAction={() => {}}
  canSave={false}
  width={'large'}
  on:close={() => {
    dispatch('close')
  }}
>
  <svelte:fragment slot="title">
    <div class="flex-row-center flex-gap-2">
      <div class="fs-bold">#{number}</div>
      <div class="time"><TimeSince value={version.createdOn} /></div>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="buttons">
    <div class="time mr-2"><Label label={document.string.CompareTo} /></div>
    <DropdownLabels {items} bind:selected={compareWith} kind={'regular'} size={'small'} />
  </svelte:fragment>

  <!-- replaces the default ok button, nothing to save here -->
  <svelte:fragment slot="after-buttons">
    {#if !readonly}
      <Button
        label={document.string.RestoreVersion}
        kind={'primary'}
        size={'large'}
        on:click={() => {
          dispatch('close', 'restore')
        }}
      />
    {/if}
  </svelte:fragment>

  {#if loadingBaseline}
    <Loading />
  {:else if baseline !== undefined && areEqualJson(content, baseline)}
    <div class="same"><Label label={document.string.SameAsCurrent} /></div>
  {:else}
    {#key compareWith}
      <!-- preview shows the whole version: decorations only, nothing pruned away -->
      <MarkupDiffViewer {content} comparedVersion={baseline} />
    {/key}
  {/if}
</Card>

<style lang="scss">
  .time {
    font-size: 0.75rem;
    color: var(--theme-trans-color);
  }
  .same {
    padding: 2rem;
    text-align: center;
    color: var(--theme-trans-color);
  }
</style>
