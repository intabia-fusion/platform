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
  import { IconAdd, IconSearch } from '@hcengineering/ui'
  import {
    Button,
    Checkbox,
    Chip,
    DateInput,
    Kbd,
    Link,
    NumberInput,
    Radio,
    SearchInput,
    SegmentedControl,
    StatusIcon,
    TextInput,
    Toggle,
    type ButtonKind
  } from '@hcengineering/ui/kit'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { onMount } from 'svelte'

  import TokenSpecimen, { specimenComponents } from './TokenSpecimen.svelte'

  interface TokenRow {
    name: string
    components: string[]
    value: string
    contexts: Map<string, UseContext>
  }

  interface TokenGroup {
    key: string
    title: string
    rows: TokenRow[]
  }

  const buttonKinds: ButtonKind[] = [
    'primary',
    'brand',
    'secondary',
    'tertiary',
    'ghost',
    'positive',
    'negative',
    'light',
    'dark'
  ]

  function buttonKind (key: string): ButtonKind | undefined {
    return buttonKinds.find((kind) => key === `button-${kind}`)
  }

  const label = getEmbeddedLabel

  // The main users of a token, as live samples; the full list of users stays in text below.
  function samplesOf (row: TokenRow): string[] {
    return specimenComponents.filter((component) => row.components.includes(component)).slice(0, 5)
  }
  const segments = [
    { id: 'list', label: label('List') },
    { id: 'board', label: label('Board') }
  ]
  const sampleDate = new Date(2026, 9, 24, 9, 30).getTime()

  // The kit sources are read at build time, so the map follows the code without a list kept by hand.
  const sources = import.meta.glob('../../../../packages/ui/src/ui-kit/**/*.svelte', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>

  // Built from parts: the markup comment opener inside a script would end up in the template.
  const markupComment = new RegExp('<' + '!--[\\s\\S]*?--' + '>', 'g')
  /** Where a token is used inside a component: the modifiers, elements and states of the selector around it. */
  interface UseContext {
    mods: string[]
    elements: string[]
    states: string[]
  }

  const usage = new Map<string, Map<string, UseContext[]>>()

  function addUse (name: string, component: string, context: UseContext): void {
    if (!usage.has(name)) usage.set(name, new Map())
    const byComponent = usage.get(name)
    if (byComponent === undefined) return
    if (!byComponent.has(component)) byComponent.set(component, [])
    byComponent.get(component)?.push(context)
  }

  // A rough reading of the selector: `:not(...)` excludes a state, so it does not count.
  function contextOf (selectors: string[]): UseContext {
    const text = selectors.join(' ').replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')
    const mods = [...text.matchAll(/(?:&|\.[a-z][a-z0-9-]*)--([a-z0-9][a-z0-9-]*)/g)].map((match) => match[1])
    const elements = [...text.matchAll(/__([a-z][a-z0-9-]*)/g)].map((match) => match[1])
    const states = ['hover', 'focus', 'active', 'disabled', 'checked', 'indeterminate'].filter((state) =>
      text.includes(`:${state}`)
    )
    return { mods, elements, states }
  }

  function readStyle (component: string, style: string): void {
    const stack: string[] = []
    let buffer = ''
    for (const char of style) {
      if (char === '{') {
        stack.push(buffer.trim())
        buffer = ''
      } else if (char === '}') {
        stack.pop()
        buffer = ''
      } else if (char === ';') {
        for (const match of buffer.matchAll(/var\(\s*(--[A-Za-z][\w-]*)/g)) {
          addUse(match[1], component, contextOf(stack))
        }
        buffer = ''
      } else buffer += char
    }
  }

  for (const [path, source] of Object.entries(sources)) {
    const component = path.split('/').pop()?.replace('.svelte', '') ?? path
    // A token named only in a comment is not used.
    const code = source
      .replace(markupComment, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const styleStart = code.indexOf('<style')
    const style = styleStart === -1 ? '' : code.slice(code.indexOf('>', styleStart) + 1, code.indexOf('</style>'))
    readStyle(component, style)
    const markup = styleStart === -1 ? code : code.slice(0, styleStart)
    for (const match of markup.matchAll(/var\(\s*(--[A-Za-z][\w-]*)/g)) {
      addUse(match[1], component, { mods: [], elements: [], states: [] })
    }
  }

  // A hover or pressed token is shown by setting the component's base token to it: the base is the same name without
  // the state, among the tokens the component uses.
  function swapFor (token: string, component: string): string | undefined {
    // `active` is a pressed color only for buttons; elsewhere it is the checked or selected one.
    if (!token.includes('hover') && !(token.startsWith('--button-') && token.includes('active'))) return undefined
    const candidates = [
      token.replace(/-(hover|active)-/, '-'),
      token.replace(/-(hover|active)$/, '-color'),
      token.replace(/-(hover|active)$/, ''),
      token.replace(/(hover|active)-/, '')
    ]
    return candidates.find((name) => name !== token && usage.get(name)?.has(component) === true)
  }

  // The plainest use shows the color best: one without hover or focus when there is such.
  function bestContext (contexts: UseContext[]): UseContext {
    const rank = (context: UseContext): number =>
      context.states.filter((state) => state === 'hover' || state === 'focus' || state === 'active').length * 10 +
      context.mods.length
    return [...contexts].sort((a, b) => rank(a) - rank(b))[0]
  }

  const groupTitles: Record<string, string> = {
    global: 'Глобальные: текст, фон, фокус, ошибка',
    theme: 'Тема: панели, разделители, состояния',
    input: 'Поля ввода',
    button: 'Кнопки',
    accent: 'Акцент воркспейса',
    popover: 'Попапы',
    scrollbar: 'Полоса прокрутки',
    selector: 'Выбор в списках'
  }

  // Shared tokens first, then fields and lists, the button kinds last.
  const groupOrder = ['global', 'theme', 'input', 'selector', 'popover', 'scrollbar', 'accent']

  function groupRank (key: string): number {
    const index = groupOrder.indexOf(key)
    return index === -1 ? groupOrder.length : index
  }

  let root: HTMLElement
  let groups: TokenGroup[] = []
  let query = ''
  let total = 0

  function family (name: string): string {
    const parts = name.slice(2).split('-')
    // Buttons are many: one group per kind, so a kind reads as a whole.
    if (parts[0] === 'button' && parts.length > 2) return `button-${parts[1]}`
    return parts[0]
  }

  function groupTitle (key: string): string {
    if (key.startsWith('button-')) return `Кнопки: ${key.slice(7)}`
    return groupTitles[key] ?? key
  }

  function isColor (value: string): boolean {
    return value !== '' && CSS.supports('color', value)
  }

  function read (): void {
    const style = getComputedStyle(root)
    const byGroup = new Map<string, TokenRow[]>()
    for (const [name, byComponent] of usage) {
      const components = [...byComponent.keys()]
      const contexts = new Map([...byComponent.entries()].map(([component, uses]) => [component, bestContext(uses)]))
      const value = style.getPropertyValue(name).trim()
      if (!isColor(value)) continue
      const key = family(name)
      if (!byGroup.has(key)) byGroup.set(key, [])
      byGroup.get(key)?.push({ name, components: components.sort(), value, contexts })
    }
    total = [...byGroup.values()].reduce((sum, rows) => sum + rows.length, 0)
    groups = [...byGroup.entries()]
      .sort(([a], [b]) => (groupRank(a) !== groupRank(b) ? groupRank(a) - groupRank(b) : a.localeCompare(b)))
      .map(([key, rows]) => ({ key, title: groupTitle(key), rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }))
  }

  onMount(() => {
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
    }
  })

  $: needle = query.trim().toLowerCase()
  $: shown = groups
    .map((group) => ({
      ...group,
      rows:
        needle === ''
          ? group.rows
          : group.rows.filter(
              (row) =>
                row.name.toLowerCase().includes(needle) ||
                row.components.some((component) => component.toLowerCase().includes(needle))
            )
    }))
    .filter((group) => group.rows.length > 0)
</script>

<div class="color-map" bind:this={root}>
  <p class="color-map__intro">
    Все цветовые токены, которые использует кит: собраны из исходников `packages/ui/src/ui-kit` при сборке, поэтому
    карта не отстаёт от кода; упоминания в комментариях не считаются. Значения - для текущей темы, тема переключается в
    тулбаре. В строке - живые примеры главных компонентов с этим токеном в нужном состоянии и полный список компонентов.
    Поиск - по токену или компоненту. Токенов: {total}.
  </p>
  <div class="color-map__search">
    <SearchInput delay={0} fullWidth aria-label="Token or component" on:change={(event) => (query = event.detail)} />
  </div>
  {#each shown as group}
    <section class="color-map__group">
      <header class="color-map__head">
        <h2 class="color-map__title">{group.title} <span class="color-map__count">{group.rows.length}</span></h2>
        <div class="color-map__examples">
          {#if buttonKind(group.key) !== undefined}
            <Button kind={buttonKind(group.key)} label={label('Button')} size="small" />
            <Button kind={buttonKind(group.key)} icon={IconAdd} label={label('Add')} size="small" />
            <Button kind={buttonKind(group.key)} icon={IconSearch} size="small" tooltip={{ label: label('Search') }} />
            <Button kind={buttonKind(group.key)} label={label('Disabled')} size="small" disabled />
            {#if group.key === 'button-positive' || group.key === 'button-negative' || group.key === 'button-primary'}
              <Checkbox
                kind={buttonKind(group.key) === 'primary'
                  ? 'primary'
                  : buttonKind(group.key) === 'positive'
                    ? 'positive'
                    : 'negative'}
                checked
                label={label('Checkbox')}
              />
              <Toggle
                kind={buttonKind(group.key) === 'primary'
                  ? 'primary'
                  : buttonKind(group.key) === 'positive'
                    ? 'positive'
                    : 'negative'}
                checked
                label={label('Toggle')}
              />
            {/if}
          {:else if group.key === 'global'}
            <TextInput label={label('Name')} required placeholder={label('Name')} size="small" />
            <Link label={label('Link')} href="#color-map" />
            <Checkbox label={label('Disabled')} disabled />
            <StatusIcon tone="error" />
            <Kbd keys={['⌘', 'K']} />
          {:else if group.key === 'theme'}
            <Chip label={label('Regular')} tone="regular" />
            <Chip label={label('Positive')} tone="positive" />
            <Chip label={label('Negative')} tone="negative" />
            <Chip label={label('Ghost')} tone="ghost" />
            <SegmentedControl items={segments} selected="list" />
          {:else if group.key === 'input'}
            <TextInput placeholder={label('Field')} size="small" />
            <TextInput error value="anna@" placeholder={label('Email')} size="small" />
            <NumberInput value={3} aria-label="Count" size="small" />
            <DateInput value={sampleDate} aria-label="Date" size="small" />
            <SearchInput size="small" />
          {:else if group.key === 'selector'}
            <Checkbox checked label={label('Checked')} />
            <Checkbox label={label('Unchecked')} />
            <Radio value={1} group={1} label={label('Selected')} />
            <Radio value={2} group={1} label={label('Other')} />
          {:else if group.key === 'button-selected'}
            <Button kind="secondary" label={label('Selected')} size="small" selected />
            <Button kind="ghost" icon={IconSearch} size="small" selected tooltip={{ label: label('Search') }} />
            <SegmentedControl items={segments} selected="board" />
          {:else if group.key === 'button-disabled'}
            <Button kind="secondary" label={label('Disabled')} size="small" disabled />
            <Button kind="primary" label={label('Disabled')} size="small" disabled />
            <TextInput value="Disabled" placeholder={label('Field')} size="small" disabled />
            <Toggle label={label('Disabled')} disabled />
          {:else if group.key === 'button-accent'}
            <Button kind="primary" label={label('On accent')} size="small" />
            <Checkbox checked label={label('Checked')} />
            <Toggle checked label={label('Toggle')} />
            <Chip label={label('Solid')} kind="solid" />
          {:else if group.key === 'button-subtle'}
            <Button kind="secondary" icon={IconSearch} label={label('Subtle label')} size="small" />
            <Button kind="tertiary" icon={IconAdd} label={label('Tertiary')} size="small" />
          {/if}
        </div>
      </header>
      {#each group.rows as row}
        <div class="color-map__row">
          <span class="color-map__sample" style:background={`var(${row.name})`} />
          <span class="color-map__info">
            <code class="color-map__name">{row.name}</code>
            <span class="color-map__value">{row.value}</span>
          </span>
          <span class="color-map__uses">
            <span class="color-map__specimens">
              {#each samplesOf(row) as component}
                <span class="color-map__specimen" title={component}>
                  {#if swapFor(row.name, component) !== undefined}
                    <TokenSpecimen {component} token={row.name} context={row.contexts.get(component)} plain />
                    <TokenSpecimen
                      {component}
                      token={row.name}
                      context={row.contexts.get(component)}
                      swap={swapFor(row.name, component)}
                    />
                  {:else}
                    <TokenSpecimen {component} token={row.name} context={row.contexts.get(component)} />
                  {/if}
                </span>
              {/each}
            </span>
            <span class="color-map__components">{row.components.join(', ')}</span>
          </span>
        </div>
      {/each}
    </section>
  {/each}
</div>

<style lang="scss">
  .color-map {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    color: var(--global-primary-TextColor);

    &__intro {
      margin: 0;
      max-width: 60rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-secondary-TextColor);
    }
    &__search {
      max-width: 24rem;
    }
    &__group {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-1_5) var(--spacing-2);
      border: 1px solid var(--theme-divider-color);
      border-radius: var(--medium-BorderRadius);
      background-color: var(--theme-panel-color);
    }
    &__head {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1_5);
      padding-bottom: var(--spacing-1_5);
      border-bottom: 1px solid var(--theme-divider-color);
    }
    &__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    &__count {
      font-weight: 400;
      color: var(--global-secondary-TextColor);
    }
    &__examples {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1_5) var(--spacing-2);

      &:empty {
        display: none;
      }
    }
    &__row {
      display: grid;
      grid-template-columns: 3rem minmax(20rem, 30rem) 1fr;
      gap: var(--spacing-2);
      align-items: center;
      padding: var(--spacing-0_75) 0;

      & + & {
        border-top: 1px solid var(--theme-divider-color);
      }
    }
    // A filled square; the divider line keeps a light or translucent color apart from the card.
    &__sample {
      width: 3rem;
      height: 2rem;
      border-radius: var(--small-BorderRadius);
      box-shadow: inset 0 0 0 1px var(--theme-divider-color);
    }
    &__info {
      display: flex;
      align-items: baseline;
      gap: var(--spacing-1);
      min-width: 0;
    }
    &__name {
      font-size: 0.875rem;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    &__value {
      font-family: var(--mono-font, monospace);
      font-size: 0.75rem;
      white-space: nowrap;
      color: var(--global-secondary-TextColor);
    }
    &__uses {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-0_75);
      min-width: 0;
    }
    &__specimens {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-2);

      &:empty {
        display: none;
      }
    }
    &__specimen {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    &__components {
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
