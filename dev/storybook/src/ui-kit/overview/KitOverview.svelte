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
  import { Severity, Status, getEmbeddedLabel } from '@hcengineering/platform'
  import { IconAdd, IconFile, IconFolder, IconMoreH, IconSettings, IconThread } from '@hcengineering/ui'
  import {
    AccordionItem,
    Breadcrumbs,
    Button,
    ButtonGroup,
    Calendar,
    Checkbox,
    Chip,
    CodeInput,
    DateInput,
    DateLabel,
    DateSelect,
    EmptyState,
    FilterButton,
    IconButton,
    Kbd,
    Link,
    List,
    Loading,
    Menu,
    MenuButton,
    NavGroup,
    NavItem,
    NumberInput,
    PanelHeader,
    ProgressBar,
    ProgressCircle,
    Radio,
    RelativeTime,
    SearchInput,
    Section,
    SegmentedControl,
    SelectButton,
    ShowMore,
    Slider,
    Spinner,
    SplitButton,
    StatusIcon,
    StatusMessage,
    Steps,
    Tabs,
    TextArea,
    TextInput,
    Toast,
    Toggle,
    WorkbenchTab,
    WorkspaceLogo,
    type ButtonKind
  } from '@hcengineering/ui/kit'

  import { categories, modeEnabled, typeGroup } from '../filter-button/filters'
  import { actions } from '../menu/items'
  import ExampleIcon from '../select-button/ExampleIcon.svelte'

  const t = getEmbeddedLabel
  const kinds: ButtonKind[] = [
    'primary',
    'brand',
    'secondary',
    'tertiary',
    'ghost',
    'positive',
    'negative',
    'positive-ghost',
    'negative-ghost'
  ]
  const surfaceKinds: ButtonKind[] = ['light', 'dark']
  const sizes = ['small', 'medium'] as const
  const fieldKinds = ['secondary', 'ghost'] as const
  const chipKinds = ['tint', 'solid', 'outline', 'neutral'] as const
  const tones = ['positive', 'negative', 'warning', 'info', 'neutral'] as const
  const toastTones = ['info', 'success', 'warning', 'error'] as const

  const value = new Date(2026, 9, 24, 9, 30).getTime()
  const now = Date.now()
  const month = new Date(2026, 9, 1).getTime()
  const code = t('Account with this email already exists')
  const high = { icon: ExampleIcon, iconProps: { glyph: 'high' }, label: t('High') }
  const noPriority = { icon: ExampleIcon, iconProps: { glyph: 'priority' }, placeholder: t('No priority') }
  const views = [
    { id: 'list', label: t('List') },
    { id: 'board', label: t('Board') },
    { id: 'table', label: t('Table') }
  ]
  const panels = [
    { id: 'activity', icon: IconThread, tooltip: { label: t('Activity') } },
    { id: 'settings', icon: IconSettings, tooltip: { label: t('Settings') } }
  ]
  const segments = [
    { id: 'all', label: t('All') },
    { id: 'active', label: t('Active') },
    { id: 'done', label: t('Completed') }
  ]
  const tabs = [
    { id: 'general', label: t('General') },
    { id: 'members', label: t('Members') },
    { id: 'billing', label: t('Billing') }
  ]
  const steps = [
    { id: 'file', label: t('Select file') },
    { id: 'statuses', label: t('Map statuses') },
    { id: 'review', label: t('Review') }
  ]
  const crumbs = [{ icon: IconSettings, label: t('API and webhooks') }, { label: t('Outgoing endpoint') }]
  const listItems = ['Anna Petrova', 'Boris Ivanov', 'Clara Smith']
  const longText =
    'The release moves the editor to the new toolbar, keeps drafts between sessions and fixes the cursor jumping to the end of a paragraph after a paste.'
  const hours = 60 * 60 * 1000
</script>

<div class="overview">
  <section class="group" aria-labelledby="ov-buttons">
    <h2 class="group__title" id="ov-buttons">Кнопки</h2>

    <div class="line">
      <span class="line__label">Button, medium</span>
      <div class="line__items">
        {#each kinds as kind}
          <Button {kind} size="medium" label={t(kind)} icon={IconAdd} />
        {/each}
        <span class="surface">
          {#each surfaceKinds as kind}
            <Button {kind} size="medium" label={t(kind)} icon={IconAdd} />
          {/each}
        </span>
      </div>
    </div>
    <div class="line">
      <span class="line__label">Button, disabled</span>
      <div class="line__items">
        {#each kinds as kind}
          <Button {kind} size="medium" label={t(kind)} icon={IconAdd} disabled />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">Button, loading</span>
      <div class="line__items">
        {#each kinds as kind}
          <Button {kind} size="medium" label={t(kind)} loading />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">IconButton</span>
      <div class="line__items">
        {#each kinds as kind}
          <IconButton {kind} size="medium" icon={IconSettings} tooltip={{ label: t(`Settings ${kind}`) }} />
        {/each}
        <IconButton
          kind="secondary"
          size="medium"
          icon={IconSettings}
          disabled
          tooltip={{ label: t('Settings disabled') }}
        />
        <IconButton
          kind="secondary"
          size="medium"
          icon={IconSettings}
          loading
          tooltip={{ label: t('Settings loading') }}
        />
      </div>
    </div>
    <div class="line">
      <span class="line__label">SelectButton</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <SelectButton {kind} size="medium" {...high} chevron />
          <SelectButton {kind} size="medium" {...noPriority} chevron />
        {/each}
        <SelectButton kind="secondary" size="medium" {...high} chevron disabled />
        <SelectButton kind="secondary" size="medium" {...noPriority} chevron disabled />
      </div>
    </div>
    <div class="line">
      <span class="line__label">MenuButton, SplitButton</span>
      <div class="line__items">
        <MenuButton items={views} selected="list" label={t('View')} kind="secondary" size="medium" />
        <MenuButton
          items={views}
          noSelection
          icon={IconMoreH}
          kind="ghost"
          size="medium"
          tooltip={{ label: t('More actions') }}
        />
        <SplitButton label={t('Create issue')} kind="brand" size="medium" />
        <SplitButton label={t('Create issue')} kind="secondary" size="medium" />
        <SplitButton label={t('Create issue')} kind="primary" size="medium" disabled />
      </div>
    </div>
    <div class="line">
      <span class="line__label">ButtonGroup, Link, Kbd</span>
      <div class="line__items">
        <ButtonGroup items={panels} selected="activity" kind="ghost" size="small" aria-label="Aside panels" />
        <ButtonGroup items={panels} selected="settings" kind="secondary" size="small" aria-label="Aside panels" />
        <Link label={t('Create an application')} />
        <Link label={t('Open documentation')} href="#docs" external />
        <Link label={t('Disabled link')} disabled />
        <Kbd keys={['shift', 'Enter']} />
        <Kbd keys={['command', 'K']} />
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-fields">
    <h2 class="group__title" id="ov-fields">Поля</h2>

    <div class="line">
      <span class="line__label">TextInput</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <TextInput {kind} size="medium" placeholder={t(`Name, ${kind}`)} />
          <TextInput {kind} size="medium" value="Design review" clearable aria-label="Name with value" />
          <TextInput {kind} size="medium" value="Design review" disabled aria-label="Name disabled" />
          <TextInput {kind} size="medium" value="Design review" error aria-label="Name with error" />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">TextArea</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <TextArea {kind} size="small" rows={2} placeholder={t(`Description, ${kind}`)} />
          <TextArea
            {kind}
            size="small"
            rows={2}
            value="Collect the feedback from the review"
            disabled
            aria-label="Description disabled"
          />
          <TextArea
            {kind}
            size="small"
            rows={2}
            value="Collect the feedback from the review"
            error
            aria-label="Description error"
          />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">NumberInput, SearchInput</span>
      <div class="line__items">
        <NumberInput value={12} min={1} max={100} size="medium" />
        <NumberInput value={3} min={1} max={100} size="medium" disabled />
        {#each fieldKinds as kind}
          <SearchInput {kind} size="medium" />
          <SearchInput {kind} size="medium" value="design review" />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">CodeInput</span>
      <div class="line__items">
        <CodeInput value="482" size="medium" aria-label="Confirmation code" />
        <CodeInput value="482913" size="medium" disabled aria-label="Confirmation code disabled" />
        <CodeInput value="482913" size="medium" error aria-label="Confirmation code with error" />
      </div>
    </div>
    <div class="line">
      <span class="line__label">DateInput</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <DateInput {kind} size="medium" {value} aria-label="Date" />
          <DateInput {kind} size="medium" value={null} aria-label="Empty date" />
          <DateInput {kind} size="medium" {value} disabled aria-label="Date disabled" />
        {/each}
        <DateInput size="medium" {value} clearable aria-label="Date and time" />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Slider</span>
      <div class="line__items">
        <span class="fixed"><Slider value={40} size="medium" aria-label="Zoom" /></span>
        <span class="fixed"><Slider value={40} size="small" showValue aria-label="Zoom small" /></span>
        <span class="fixed"><Slider value={40} disabled aria-label="Zoom disabled" /></span>
      </div>
    </div>
    <div class="line">
      <span class="line__label">FilterButton</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <FilterButton {categories} {kind} size="medium" />
          <FilterButton {categories} {kind} size="medium" activeFilters={[typeGroup, modeEnabled]} />
          <FilterButton {categories} {kind} size="medium" activeFilters={[typeGroup]} disabled />
        {/each}
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-choice">
    <h2 class="group__title" id="ov-choice">Выбор</h2>

    <div class="line">
      <span class="line__label">Checkbox</span>
      <div class="line__items">
        <Checkbox aria-label="Off" />
        <Checkbox checked aria-label="On" />
        <Checkbox checked indeterminate aria-label="Indeterminate" />
        <Checkbox disabled aria-label="Disabled" />
        <Checkbox checked disabled aria-label="Disabled on" />
        <Checkbox error aria-label="Error" />
        <Checkbox checked kind="brand" label={t('Show archived')} />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Radio</span>
      <div class="line__items">
        <Radio value="a" group={null} aria-label="Off" />
        <Radio value="a" group="a" aria-label="On" />
        <Radio value="a" group={null} disabled aria-label="Disabled" />
        <Radio value="a" group="a" disabled aria-label="Disabled on" />
        <Radio value="a" group={null} error aria-label="Error" />
        <Radio value="a" group="a" label={t('Each month')} />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Toggle</span>
      <div class="line__items">
        <Toggle aria-label="Off" />
        <Toggle checked aria-label="On" />
        <Toggle disabled aria-label="Disabled" />
        <Toggle checked disabled aria-label="Disabled on" />
        <Toggle checked label={t('Make private')} />
      </div>
    </div>
    <div class="line">
      <span class="line__label">SegmentedControl, Tabs</span>
      <div class="line__items">
        <SegmentedControl items={segments} selected="all" size="small" aria-label="Milestones" />
        <SegmentedControl items={segments} selected="active" size="medium" aria-label="Milestones medium" />
        <Tabs items={tabs} selected="general" size="medium" aria-label="Settings sections" />
        <Tabs items={tabs} selected="members" size="small" aria-label="Settings sections small" />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Chip</span>
      <div class="line__items">
        {#each chipKinds as kind}
          <Chip {kind} size="small" label={t(kind)} removable />
          <Chip {kind} size="small" label={t('Frontend')} color="#E25F8B" />
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">StatusIcon</span>
      <div class="line__items">
        {#each tones as tone}
          <StatusIcon {tone} size="medium" tooltip={{ label: t(tone) }} />
        {/each}
        {#each tones as tone}
          <StatusIcon {tone} dot tooltip={{ label: t(`${tone} dot`) }} />
        {/each}
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-dates">
    <h2 class="group__title" id="ov-dates">Даты</h2>

    <div class="line">
      <span class="line__label">DateSelect, DateLabel, RelativeTime</span>
      <div class="line__items">
        {#each fieldKinds as kind}
          <DateSelect {kind} size="medium" {value} />
          <DateSelect {kind} size="medium" value={null} placeholder={t('Due date')} />
        {/each}
        <DateSelect size="medium" {value} tone="critical" />
        <DateSelect size="medium" {value} disabled />
        <DateLabel {value} />
        <DateLabel {value} />
        <RelativeTime value={now - 5 * 60 * 1000} format="ago" />
        <RelativeTime value={now + 3 * 24 * hours} format="countdown" />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Calendar</span>
      <div class="line__items">
        <Calendar {value} {month} />
        <Calendar range value={new Date(2026, 9, 12).getTime()} end={new Date(2026, 9, 21).getTime()} {month} />
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-feedback">
    <h2 class="group__title" id="ov-feedback">Обратная связь</h2>

    <div class="line">
      <span class="line__label">StatusMessage</span>
      <div class="line__items line__items--column">
        <StatusMessage status={new Status(Severity.ERROR, code, {})} />
        <StatusMessage status={new Status(Severity.WARNING, code, {})} />
        <StatusMessage status={new Status(Severity.INFO, code, {})} />
      </div>
    </div>
    <div class="line">
      <span class="line__label">Toast</span>
      <div class="line__items">
        {#each toastTones as tone}
          <span class="toast">
            <Toast {tone} title={t(`Export ${tone}`)} closable>Your workspace export is ready.</Toast>
          </span>
        {/each}
      </div>
    </div>
    <div class="line">
      <span class="line__label">EmptyState, Loading</span>
      <div class="line__items">
        <span class="panel panel--wide">
          <EmptyState
            label={t('No issues yet')}
            description={t('Issues of the project will appear here')}
            icon={IconFolder}
          >
            <Button kind="primary" size="medium" label={t('Create issue')} />
          </EmptyState>
        </span>
        <span class="panel panel--frame">
          <Loading label={t('Connecting')} delay={false} />
        </span>
      </div>
    </div>
    <div class="line">
      <span class="line__label">Spinner, ProgressCircle, ProgressBar</span>
      <div class="line__items">
        <Spinner size="medium" aria-label="Loading" />
        <Spinner size="small" kind="brand" label={t('Clearing')} />
        <ProgressCircle value={2} max={5} size="small" aria-label="Progress 2 of 5" />
        <ProgressCircle value={5} max={5} size="small" aria-label="Progress 5 of 5" />
        <span class="fixed"><ProgressBar value={40} kind="brand" aria-label="Storage" /></span>
        <span class="fixed"><ProgressBar value={70} kind="positive" aria-label="Upload" /></span>
        <span class="fixed"><ProgressBar value={90} kind="negative" aria-label="Quota" /></span>
      </div>
    </div>
    <div class="line">
      <span class="line__label">Steps</span>
      <div class="line__items">
        <Steps items={steps} selected="statuses" aria-label="Import steps" />
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-navigation">
    <h2 class="group__title" id="ov-navigation">Навигация</h2>

    <div class="line">
      <span class="line__label">NavGroup, NavItem</span>
      <div class="line__items">
        <div class="nav">
          <NavGroup label={t('Spaces')} kind="section" expandable open>
            <div class="nav__items">
              <NavItem label={t('Documents')} icon={IconFolder} kind="link" count={3} />
              <NavItem label={t('Product team')} icon={IconThread} kind="link" selected />
              <NavItem label={t('Design')} icon={IconFile} kind="link" disabled />
              <NavItem label={t('general')} icon={IconThread} kind="object" />
              <NavItem label={t('Overview')} kind="anchor" />
            </div>
          </NavGroup>
        </div>
      </div>
    </div>
    <div class="line">
      <span class="line__label">Breadcrumbs, WorkspaceLogo</span>
      <div class="line__items">
        <Breadcrumbs items={crumbs} />
        <WorkspaceLogo name="Intabia" size="small" />
        <WorkspaceLogo name="Intabia" size="small" notify />
        <WorkspaceLogo name="Intabia" size="extra-small" />
      </div>
    </div>
    <div class="line">
      <span class="line__label">WorkbenchTab</span>
      <div class="line__items">
        <div class="tabs" role="tablist" aria-label="Opened objects">
          <WorkbenchTab label={t('Release plan')} icon={IconFolder} />
          <WorkbenchTab label={t('Release plan')} icon={IconFolder} selected closable />
          <WorkbenchTab label={t('Pinned')} icon={IconFolder} kind="outline" />
          <WorkbenchTab label={t('Preview')} icon={IconFolder} preview closable />
        </div>
      </div>
    </div>
    <div class="line">
      <span class="line__label">PanelHeader</span>
      <div class="line__items">
        <div class="header">
          <PanelHeader>
            <span class="header__title">Issues</span>
            <svelte:fragment slot="actions">
              <IconButton icon={IconMoreH} kind="ghost" size="small" tooltip={{ label: t('More actions') }} />
              <Button icon={IconAdd} label={t('New issue')} kind="primary" size="small" />
            </svelte:fragment>
          </PanelHeader>
        </div>
      </div>
    </div>
    <div class="line">
      <span class="line__label">AccordionItem, Section, ShowMore</span>
      <div class="line__items">
        <div class="panel panel--nav">
          <AccordionItem label={t('Today')} open counter={3} duration={2.5 * hours} size="large">
            <ul class="plain">
              <li>Entry 1</li>
              <li>Entry 2</li>
            </ul>
          </AccordionItem>
          <AccordionItem label={t('Yesterday')} counter={2} size="medium" />
        </div>
        <div class="panel panel--wide">
          <Section label={t('Members')} icon={IconFile}>
            <svelte:fragment slot="actions">
              <IconButton icon={IconAdd} kind="ghost" size="small" tooltip={{ label: t('Add member') }} />
            </svelte:fragment>
            <ul class="plain">
              <li>Anna Smirnova</li>
              <li>Igor Petrov</li>
            </ul>
          </Section>
        </div>
        <div class="panel panel--wide">
          <ShowMore limit={80}>
            <p class="plain">{longText}</p>
            <p class="plain">{longText}</p>
          </ShowMore>
        </div>
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-menus">
    <h2 class="group__title" id="ov-menus">Меню</h2>

    <div class="line">
      <span class="line__label">Menu embedded, List</span>
      <div class="line__items line__items--top">
        <div class="panel panel--menu">
          <Menu items={actions} embedded autofocus={false} aria-label="Actions" />
        </div>
        <div class="panel panel--menu panel--list">
          <List count={listItems.length} items={listItems} aria-label="People">
            <span slot="item" class="list-row" let:value>{value}</span>
          </List>
        </div>
      </div>
    </div>
  </section>

  <section class="group" aria-labelledby="ov-sizes">
    <h2 class="group__title" id="ov-sizes">Один размер рядом</h2>

    {#each sizes as size}
      <div class="line line--center">
        <span class="line__label">{size}</span>
        <div class="line__items line__items--aligned">
          <Button kind="secondary" {size} label={t('Button')} icon={IconAdd} />
          <IconButton kind="secondary" {size} icon={IconSettings} tooltip={{ label: t('Settings') }} />
          <SelectButton kind="secondary" {size} {...high} chevron />
          <div class="fixed"><TextInput kind="secondary" {size} placeholder={t('TextInput')} fullWidth /></div>
          <SearchInput kind="secondary" {size} />
          <DateInput kind="secondary" {size} {value} aria-label="Date" />
          <SegmentedControl items={segments} selected="all" {size} aria-label={`Milestones ${size}`} />
          <!-- Chip has no medium: it stays in the small row only. -->
          {#if size === 'small'}<Chip kind="neutral" {size} label={t('Chip')} removable />{/if}
          <FilterButton {categories} kind="secondary" {size} />
        </div>
      </div>
    {/each}
  </section>
</div>

<style lang="scss">
  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-5);
    padding-bottom: var(--spacing-4);
    color: var(--global-primary-TextColor);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background-color: var(--theme-panel-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);

    &__title {
      margin: 0 0 var(--spacing-1);
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--theme-caption-color);
    }
  }
  .line {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-3);

    &--center {
      align-items: center;
    }
    &__label {
      display: flex;
      flex: 0 0 11rem;
      align-items: center;
      min-height: 2rem;
      font-size: 0.75rem;
      color: var(--theme-dark-color);
    }
    &__items {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      align-items: center;
      min-width: 0;

      &--column {
        flex-direction: column;
        align-items: flex-start;
      }
      &--top {
        align-items: flex-start;
      }
      // Centred as controls stand in a toolbar; the dashed guides show a control of another height.
      &--aligned {
        align-items: center;
        border-block: 1px dashed var(--theme-divider-color);

        // Controls keep their natural size; a row that does not fit wraps instead of squeezing them.
        > :global(*) {
          flex-shrink: 0;
        }
      }
    }
  }
  .surface {
    display: inline-flex;
    gap: var(--spacing-1);
    padding: var(--spacing-1);
    background-color: var(--button-brand-BackgroundColor);
    border-radius: var(--small-BorderRadius);
  }
  .fixed {
    display: inline-flex;
    width: 10rem;
  }
  .toast {
    display: inline-flex;
    width: 25rem;
  }
  .panel {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-1);
    background-color: var(--theme-bg-color);
    border-radius: var(--small-BorderRadius);

    &--wide {
      width: 22rem;
    }
    &--nav {
      width: 18rem;
      background-color: var(--theme-navpanel-color);
    }
    &--menu {
      width: 16rem;
      padding: 0;
    }
    &--list {
      padding: var(--spacing-0_5) 0;
    }
    &--frame {
      width: 16rem;
      height: 8rem;
      border: 1px dashed var(--global-ui-BorderColor);
    }
  }
  .nav {
    width: 15rem;
    padding: var(--spacing-0_5);
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);

    &__items {
      display: flex;
      flex-direction: column;
      margin: 0 var(--spacing-1_5);
    }
  }
  .tabs {
    display: flex;
    gap: var(--spacing-1);
  }
  .header {
    flex: 1;
    min-width: 24rem;
    max-width: 48rem;
    background-color: var(--theme-comp-header-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);
    overflow: hidden;

    &__title {
      font-size: 1rem;
      font-weight: 500;
    }
  }
  .plain {
    margin: 0;
    padding: var(--spacing-0_75) var(--spacing-2);
    list-style: none;
    color: var(--global-primary-TextColor);
  }
  // The row height of a popup menu, so the two panels side by side read as one family.
  .list-row {
    display: flex;
    align-items: center;
    padding: var(--spacing-1_25) var(--spacing-1_5);
    font-size: 0.875rem;
    line-height: 1.25rem;
  }
</style>
