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
  import ui from '@hcengineering/ui'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import {
    Button,
    Chip,
    Dropdown,
    MenuButton,
    SettingRow,
    TextArea,
    Toggle,
    type DropdownItem
  } from '@hcengineering/ui/kit'

  /** One row alone (`row`), the rows of a form on one plate (`form`) or a list of switches (`list`). */
  export let sample: 'row' | 'form' | 'list' = 'row'
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
  let history = true
  let undo = false
  let limit = true
  let plain = false

  $: picked = types.filter((it) => parents.includes(it.id))
</script>

{#if sample === 'row'}
  <div class="setting-row-example setting-row-example__surface">
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
          icon={ui.icon.Plus}
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
{:else if sample === 'list'}
  <div class="setting-row-example setting-row-example__set setting-row-example__surface">
    <SettingRow
      variant="list"
      label={getEmbeddedLabel('Keep history')}
      description={getEmbeddedLabel('Every change is saved and can be restored')}
      icon={ui.icon.ClockCounterClockwise}
      color="Cerulean"
      let:labelId
      let:descriptionId
      let:controlId
    >
      <Toggle id={controlId} aria-labelledby={labelId} aria-describedby={descriptionId} bind:checked={history} />
    </SettingRow>
    <SettingRow
      variant="list"
      label={getEmbeddedLabel('Allow undo')}
      description={getEmbeddedLabel('Not available while history is off')}
      icon={ui.icon.ArrowUturnLeft}
      color="Lavander"
      disabled={!history}
      let:labelId
      let:descriptionId
      let:controlId
    >
      <Toggle
        id={controlId}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={!history}
        bind:checked={undo}
      />
    </SettingRow>
    <SettingRow
      variant="list"
      label={getEmbeddedLabel('Limit duration')}
      description={getEmbeddedLabel('Closes at the chosen time')}
      icon={ui.icon.Sliders}
      color="Firework"
      let:labelId
      let:descriptionId
      let:controlId
    >
      {#if limit}<Button kind="ghost" size="small" label={getEmbeddedLabel('24 hours')} />{/if}
      <Toggle id={controlId} aria-labelledby={labelId} aria-describedby={descriptionId} bind:checked={limit} />
    </SettingRow>
    <SettingRow variant="list" label={getEmbeddedLabel('Without an icon')} let:labelId let:controlId>
      <Toggle id={controlId} aria-labelledby={labelId} bind:checked={plain} />
    </SettingRow>
  </div>
{:else}
  <div class="setting-row-example setting-row-example__set setting-row-example__surface">
    <SettingRow
      label={getEmbeddedLabel('Type')}
      hint={hint ? getEmbeddedLabel('What the tasks of this type are') : undefined}
    >
      <div class="setting-row-example__field">
        <Dropdown items={types} bind:selected={type} size="medium" fullWidth />
      </div>
    </SettingRow>
    <SettingRow
      label={getEmbeddedLabel('Allow root task')}
      hint={hint ? getEmbeddedLabel('Tasks of this type can be top level') : undefined}
      let:labelId
    >
      <Toggle aria-labelledby={labelId} bind:checked={root} />
    </SettingRow>
    <SettingRow
      label={getEmbeddedLabel('Allowed parent task types')}
      hint={hint ? getEmbeddedLabel('Tasks that can contain this one') : undefined}
    >
      <MenuButton
        kind="secondary"
        size="small"
        icon={ui.icon.Plus}
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
    <SettingRow
      label={getEmbeddedLabel('Description')}
      hint={hint ? getEmbeddedLabel('Shown when the type is picked') : undefined}
      stacked
    >
      <TextArea bind:value={description} placeholder={getEmbeddedLabel('Description')} kind="ghost" />
    </SettingRow>
  </div>
{/if}

<style lang="scss">
  .setting-row-example {
    width: 28rem;

    &__field {
      width: 12rem;
    }
    &__set {
      display: flex;
      flex-direction: column;
    }
    // Rows live on a panel or in a dialog, not on the canvas gray.
    &__surface {
      padding: 0.25rem 1rem;
      border-radius: var(--medium-BorderRadius);
      background-color: var(--theme-panel-color);
    }
  }
</style>
