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
<script lang="ts" context="module">
  /** Components with a live sample on the color map, in the order the samples are shown. */
  export const specimenComponents = [
    'Button',
    'TextInput',
    'TextArea',
    'NumberInput',
    'DateInput',
    'SearchInput',
    'CodeInput',
    'Checkbox',
    'Radio',
    'Toggle',
    'Chip',
    'SelectButton',
    'SegmentedControl',
    'Tabs',
    'Link',
    'StatusIcon',
    'ProgressBar',
    'ProgressCircle',
    'Slider',
    'Breadcrumbs',
    'NavItem',
    'Steps',
    'Kbd',
    'Spinner',
    'WorkspaceLogo'
  ]
</script>

<script lang="ts">
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { IconFile, IconSearch } from '@hcengineering/ui'
  import {
    Breadcrumbs,
    Button,
    Checkbox,
    Chip,
    CodeInput,
    DateInput,
    Kbd,
    Link,
    NavItem,
    NumberInput,
    ProgressBar,
    ProgressCircle,
    Radio,
    SearchInput,
    SegmentedControl,
    SelectButton,
    Slider,
    Spinner,
    StatusIcon,
    Steps,
    Tabs,
    TextArea,
    TextInput,
    Toggle,
    WorkspaceLogo,
    type ButtonKind,
    type CheckboxKind,
    type ChipKind,
    type ChipTone,
    type ProgressBarKind,
    type SpinnerKind,
    type StatusIconTone,
    type ToggleKind
  } from '@hcengineering/ui/kit'

  export let component: string
  export let token: string
  /** The modifiers, elements and states of the selector the token is used in. */
  export let context: { mods: string[], elements: string[], states: string[] } | undefined = undefined
  /** A base token of the component set to `token`: its hover or pressed color shown without pointing at it. */
  export let swap: string | undefined = undefined
  /** The resting look next to a swapped sample: no state note. */
  export let plain: boolean = false

  const label = getEmbeddedLabel
  const buttonKinds: ButtonKind[] = [
    'primary',
    'brand',
    'secondary',
    'tertiary',
    'ghost',
    'positive',
    'negative',
    'positive-ghost',
    'negative-ghost',
    'light',
    'dark'
  ]
  const plainItems = [
    { id: 'list', label: label('List') },
    { id: 'board', label: label('Board') }
  ]
  const iconItems = [
    { id: 'list', label: label('List'), icon: IconSearch },
    { id: 'board', label: label('Board'), icon: IconFile }
  ]
  const date = new Date(2026, 9, 24, 9, 30).getTime()
  const stateNotes: Record<string, string> = { hover: 'ховер', focus: 'фокус', active: 'нажатие' }

  function pick<T extends string> (values: readonly T[], from: string[]): T | undefined {
    return values.find((value) => from.includes(value))
  }

  // The sample takes the variant the token is used in: the modifier of its selector, else the kind in its name.
  $: mods = context?.mods ?? []
  $: elements = context?.elements ?? []
  $: states = context?.states ?? []
  $: note = plain
    ? undefined
    : swap !== undefined
      ? token.includes('active')
        ? stateNotes.active
        : stateNotes.hover
      : states.map((state) => stateNotes[state]).find((text) => text !== undefined)
  $: kind =
    pick(buttonKinds, mods) ?? buttonKinds.find((value) => token.startsWith(`--button-${value}-`)) ?? 'secondary'
  $: checkboxKind = pick<CheckboxKind>(['primary', 'brand', 'positive', 'negative', 'neutral'], mods)
  $: toggleKind = pick<ToggleKind>(['brand', 'primary', 'positive', 'negative'], mods)
  $: chipTone = mods.find((mod) => mod.startsWith('tone-'))?.slice(5) as ChipTone | undefined
  $: chipKind = pick<ChipKind>(['tint', 'solid', 'outline', 'neutral'], mods)
  $: statusTone = pick<StatusIconTone>(['positive', 'negative', 'error', 'warning', 'info', 'neutral'], mods) ?? 'info'
  $: barKind = pick<ProgressBarKind>(['brand', 'positive', 'warning', 'negative'], mods)
  $: spinnerKind = pick<SpinnerKind>(['brand', 'neutral'], mods)
  $: disabled = mods.includes('disabled') || states.includes('disabled') || token.includes('disabled')
  $: error = mods.includes('error')
  $: selected = mods.includes('selected')
  $: required = elements.includes('required')
  $: round = mods.includes('round')
  // A choice control shows the state the token colors: checked for a kind, a mark or an active color, else unchecked.
  $: on =
    mods.includes('checked') ||
    states.includes('checked') ||
    checkboxKind !== undefined ||
    toggleKind !== undefined ||
    /active|Icon|accent|on-/.test(token)
  $: pair = disabled ? [false, true] : [on]
  $: withIcon = token.includes('Icon') || elements.includes('icon')
  $: items = withIcon ? iconItems : plainItems
</script>

<span class="specimen" style={swap !== undefined ? `${swap}: var(${token})` : undefined}>
  {#if component === 'Button'}
    <Button
      {kind}
      label={label('Button')}
      icon={withIcon ? IconSearch : undefined}
      size="small"
      {disabled}
      {selected}
    />
  {:else if component === 'TextInput'}
    <span class="specimen__field">
      {#if required}
        <TextInput label={label('Name')} required placeholder={label('Name')} size="small" fullWidth />
      {:else}
        <TextInput
          value={disabled ? 'Disabled' : 'Text'}
          placeholder={label('Text')}
          icon={withIcon ? IconSearch : undefined}
          size="small"
          {error}
          {disabled}
          fullWidth
        />
      {/if}
    </span>
  {:else if component === 'TextArea'}
    <span class="specimen__field">
      <TextArea value="Two lines of text" placeholder={label('Text')} rows={1} {error} {disabled} />
    </span>
  {:else if component === 'NumberInput'}
    <NumberInput value={3} aria-label="Count" size="small" {disabled} />
  {:else if component === 'DateInput'}
    <DateInput value={date} aria-label="Date" size="small" {disabled} />
  {:else if component === 'SearchInput'}
    <span class="specimen__field"><SearchInput value="query" size="small" fullWidth /></span>
  {:else if component === 'CodeInput'}
    <CodeInput value="12" length={4} size="small" aria-label="Code" {error} {disabled} />
  {:else if component === 'Checkbox'}
    {#each pair as checked}
      <Checkbox
        {checked}
        kind={checkboxKind}
        shape={round ? 'round' : undefined}
        label={label('Option')}
        {error}
        {disabled}
      />
    {/each}
  {:else if component === 'Radio'}
    {#each pair as checked}
      <Radio value={1} group={checked ? 1 : undefined} kind={checkboxKind} label={label('Option')} {error} {disabled} />
    {/each}
  {:else if component === 'Toggle'}
    {#each pair as checked}
      <Toggle {checked} kind={toggleKind} aria-label="Toggle" {disabled} />
    {/each}
  {:else if component === 'Chip'}
    <Chip label={label('Chip')} icon={withIcon ? IconFile : undefined} kind={chipKind} tone={chipTone} />
  {:else if component === 'SelectButton'}
    <SelectButton label={label('Value')} icon={IconFile} size="small" {disabled} />
  {:else if component === 'SegmentedControl'}
    <SegmentedControl {items} selected="list" size="small" />
  {:else if component === 'Tabs'}
    <Tabs {items} selected="list" size="small" aria-label="Views" />
  {:else if component === 'Link'}
    <Link label={label('Link')} icon={withIcon ? IconFile : undefined} href="#color-map" {disabled} />
  {:else if component === 'StatusIcon'}
    <StatusIcon tone={statusTone} />
  {:else if component === 'ProgressBar'}
    <span class="specimen__bar"><ProgressBar value={60} kind={barKind} aria-label="Progress" /></span>
  {:else if component === 'ProgressCircle'}
    <ProgressCircle value={60} aria-label="Progress" />
  {:else if component === 'Slider'}
    <span class="specimen__bar"><Slider value={40} aria-label="Level" {disabled} /></span>
  {:else if component === 'Breadcrumbs'}
    <Breadcrumbs items={[{ label: label('Space'), icon: withIcon ? IconFile : undefined }, { label: label('Page') }]} />
  {:else if component === 'NavItem'}
    <NavItem label={label('Item')} icon={IconSearch} {selected} />
  {:else if component === 'Steps'}
    <Steps
      items={[
        { id: 'one', label: label('One') },
        { id: 'two', label: label('Two') }
      ]}
      selected="one"
    />
  {:else if component === 'Kbd'}
    <Kbd keys={['⌘', 'K']} />
  {:else if component === 'Spinner'}
    <Spinner size="small" kind={spinnerKind} />
  {:else if component === 'WorkspaceLogo'}
    <WorkspaceLogo name="Intabia" size="small" notify={elements.includes('notify') || mods.includes('notify')} />
  {/if}
  {#if note !== undefined}<span class="specimen__note">{note}</span>{/if}
</span>

<style lang="scss">
  .specimen {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);

    &__field {
      display: inline-flex;
      width: 9rem;
    }
    &__bar {
      display: inline-flex;
      width: 5rem;
    }
    &__note {
      font-size: 0.6875rem;
      color: var(--global-tertiary-TextColor);
    }
  }
</style>
