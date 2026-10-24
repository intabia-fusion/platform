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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { IconAdd } from '@hcengineering/ui'
  import {
    Chip,
    Dialog,
    Dropdown,
    MenuButton,
    SettingRow,
    TextArea,
    Toggle,
    type DropdownItem
  } from '@hcengineering/ui/kit'

  /** One row alone (`row`) or a whole create dialog made of rows (`dialog`). */
  export let sample: 'row' | 'dialog' = 'row'
  export let control: 'dropdown' | 'toggle' | 'chips' | 'textarea' = 'dropdown'
  export let label = getEmbeddedLabel('Task type')
  export let hint: boolean = false

  const types: Array<DropdownItem<string>> = [
    { id: 'bug', label: getEmbeddedLabel('Bug') },
    { id: 'task', label: getEmbeddedLabel('Task') },
    { id: 'epic', label: getEmbeddedLabel('Epic') }
  ]
  let type = 'bug'
  let root = true
  let parents: string[] = ['epic', 'task']
  let description = ''

  $: picked = types.filter((it) => parents.includes(it.id))
</script>

{#if sample === 'row'}
  <div class="setting-row-example">
    <SettingRow
      {label}
      hint={hint ? getEmbeddedLabel('Explains what the setting changes') : undefined}
      stacked={control === 'textarea'}
      let:labelId
    >
      {#if control === 'dropdown'}
        <div class="setting-row-example__field">
          <Dropdown items={types} bind:selected={type} size="medium" fullWidth />
        </div>
      {:else if control === 'toggle'}
        <Toggle aria-labelledby={labelId} bind:checked={root} />
      {:else if control === 'chips'}
        <MenuButton
          kind="secondary"
          size="small"
          icon={IconAdd}
          items={types}
          selected={parents}
          multiselect
          on:selected={(e) => (parents = e.detail)}
        />
      {:else}
        <TextArea bind:value={description} placeholder={getEmbeddedLabel('Description')} kind="ghost" />
      {/if}
      <svelte:fragment slot="details">
        {#if control === 'chips'}
          {#each picked as item (item.id)}
            <Chip
              label={item.label}
              kind="neutral"
              size="small"
              removable
              on:remove={() => (parents = parents.filter((id) => id !== item.id))}
            />
          {/each}
        {/if}
      </svelte:fragment>
    </SettingRow>
  </div>
{:else}
  <div class="setting-row-example__dialog">
    <Dialog label={getEmbeddedLabel('New task type')} submitLabel={getEmbeddedLabel('Create')} canSubmit>
      <div class="setting-row-example__set">
        <SettingRow label={getEmbeddedLabel('Type')}>
          <div class="setting-row-example__field">
            <Dropdown items={types} bind:selected={type} size="medium" fullWidth />
          </div>
        </SettingRow>
        <SettingRow
          label={getEmbeddedLabel('Allow root task')}
          hint={getEmbeddedLabel('Tasks of this type can be top level')}
          let:labelId
        >
          <Toggle aria-labelledby={labelId} bind:checked={root} />
        </SettingRow>
        <SettingRow label={getEmbeddedLabel('Allowed parent task types')}>
          <MenuButton
            kind="secondary"
            size="small"
            icon={IconAdd}
            items={types}
            selected={parents}
            multiselect
            on:selected={(e) => (parents = e.detail)}
          />
          <svelte:fragment slot="details">
            {#each picked as item (item.id)}
              <Chip
                label={item.label}
                kind="neutral"
                size="small"
                removable
                on:remove={() => (parents = parents.filter((id) => id !== item.id))}
              />
            {/each}
          </svelte:fragment>
        </SettingRow>
        <SettingRow label={getEmbeddedLabel('Description')} stacked>
          <TextArea bind:value={description} placeholder={getEmbeddedLabel('Description')} kind="ghost" />
        </SettingRow>
      </div>
    </Dialog>
  </div>
{/if}

<style lang="scss">
  .setting-row-example {
    width: 28rem;

    &__field {
      width: 12rem;
    }
    &__dialog {
      width: 32rem;
    }
    &__set {
      display: flex;
      flex-direction: column;
    }
  }
</style>
