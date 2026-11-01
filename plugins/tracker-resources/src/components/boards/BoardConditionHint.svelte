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
  import core from '@hcengineering/core'
  import type { Doc, Ref, RefTo } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { Label, themeStore } from '@hcengineering/ui'
  import type { Filter, FilterMode } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import { parseFilters } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import { issuePriorities } from '../../types'

  // A board condition as read-only text, "Priority = Urgent": the label of the field, the sign, the labels of the values
  export let condition: string

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: filters = parseFilters(condition).filter((f) => f?.key?.attribute !== undefined)

  let values: string[] = []
  $: void Promise.all(filters.map(async (f) => await valueLabels(f.nested ?? f, $themeStore.language))).then((res) => {
    values = res.map((labels) => labels.join(', '))
  })

  function mode (filter: Filter): FilterMode | undefined {
    return client.getModel().findAllSync(view.class.FilterMode, { _id: filter.mode })[0]
  }

  function sign (filter: Filter): string | undefined {
    if (filter.mode === view.filter.FilterObjectIn || filter.mode === view.filter.FilterValueIn) return '='
    if (filter.mode === view.filter.FilterObjectNin || filter.mode === view.filter.FilterValueNin) return '\u2260'
    return undefined
  }

  async function valueLabels (filter: Filter, lang: string): Promise<string[]> {
    // Priorities are stored as [key, values] pairs, the other filters keep plain values
    const raw = Array.from(filter.value?.values?.() ?? []).map((p: any) => (Array.isArray(p) ? p[0] : p))
    const type = filter.key.attribute.type
    if (type._class === tracker.class.TypeIssuePriority) {
      return await Promise.all(
        raw.map(async (p) => {
          const label = issuePriorities[p as keyof typeof issuePriorities]?.label
          return label !== undefined ? await translate(label, {}, lang) : String(p)
        })
      )
    }
    if (type._class === core.class.RefTo && raw.length > 0) {
      const docs = await client.findAll((type as RefTo<Doc>).to, { _id: { $in: raw as Array<Ref<Doc>> } })
      const names = docs.map((d: any) => String(d.name ?? d.title ?? d.label ?? d._id))
      if (names.length > 0) return names
    }
    return raw.map(String)
  }
</script>

{#if filters.length > 0}
  <span class="condition" data-id="boardLaneCondition">
    {#each filters as filter, i}
      {@const filterMode = mode(filter.nested ?? filter)}
      {@const signText = sign(filter.nested ?? filter)}
      {#if i > 0}<span>·</span>{/if}
      <Label label={filter.key.label} />
      {#if filter.nested !== undefined}
        <Label label={filter.nested.key.label} />
      {/if}
      {#if signText !== undefined}
        <span>{signText}</span>
      {:else if filterMode !== undefined}
        <Label label={filterMode.selectedLabel ?? filterMode.label} params={{ value: filter.value.length }} />
      {/if}
      {#if !(filterMode?.disableValueSelector ?? false)}
        <span class="values">{values[i] ?? ''}</span>
      {/if}
    {/each}
  </span>
{/if}

<style lang="scss">
  .condition {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    font-size: 0.75rem;
    line-height: 1.25;
    white-space: nowrap;
    color: var(--theme-darker-color);
  }
</style>
