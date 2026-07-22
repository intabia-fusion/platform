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
  import { AnySvelteComponent, Icon, languageStore } from '@hcengineering/ui'
  import { TaskType } from '@hcengineering/task'
  import { WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { getClient } from '@hcengineering/presentation'
  import { Asset, translate } from '@hcengineering/platform'

  export let config: WorkflowValidatorConfig
  export let taskType: TaskType

  const client = getClient()

  interface FieldItem {
    id: string
    label: string
    icon?: Asset | AnySvelteComponent
  }

  let fieldItems: FieldItem[] = []

  $: fieldIds = Array.isArray(config?.props?.fields) ? (config.props.fields as string[]) : []
  $: void updateFields(fieldIds, $languageStore)

  async function updateFields (ids: string[], lang: string): Promise<void> {
    if (!taskType?.ofClass || ids.length === 0) {
      fieldItems = []
      return
    }
    const hierarchy = client.getHierarchy()
    const allAttrs = Array.from(hierarchy.getAllAttributes(taskType.ofClass).values())

    const res: FieldItem[] = []
    for (const id of ids) {
      const attr = allAttrs.find((a) => a._id === id)
      if (attr != null) {
        const label = await translate(attr.label, {}, lang)
        res.push({
          id,
          label,
          icon: attr.icon ?? attr.type?.icon
        })
      } else {
        res.push({ id, label: id })
      }
    }
    fieldItems = res
  }
</script>

<div class="field-required-presenter">
  {#each fieldItems as item (item.id)}
    <div class="field-required-presenter--badge">
      {#if item.icon}
        <Icon icon={item.icon} size="x-small" />
      {/if}
      <span>{item.label}</span>
    </div>
  {/each}
</div>

<style lang="scss">
  .field-required-presenter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;

    &--badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.2rem 0.5rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
      background-color: var(--global-subtle-ui-BorderColor);
      color: var(--global-primary-TextColor);

      :global(svg) {
        width: 0.875rem !important;
        height: 0.875rem !important;
        min-width: 0.875rem !important;
        min-height: 0.875rem !important;
        max-width: 0.875rem !important;
        max-height: 0.875rem !important;
        flex-shrink: 0;
        opacity: 0.85;
      }
    }
  }
</style>
