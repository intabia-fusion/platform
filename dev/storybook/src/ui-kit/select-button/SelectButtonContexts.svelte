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
  import ui, { ModernPopup, showPopup } from '@hcengineering/ui'
  import { IconButton, SelectButton, type SelectButtonChevron } from '@hcengineering/ui/kit'

  import ExampleAvatar from './ExampleAvatar.svelte'
  import ExampleIcon from './ExampleIcon.svelte'

  const t = getEmbeddedLabel
  const icon = (glyph: string): { icon: typeof ExampleIcon, iconProps: { glyph: string } } => ({
    icon: ExampleIcon,
    iconProps: { glyph }
  })

  const chevrons: SelectButtonChevron[] = [false, true, 'hover']

  const priorities = [
    { id: 'none', label: t('No priority') },
    { id: 'urgent', label: t('Urgent') },
    { id: 'high', label: t('High') },
    { id: 'medium', label: t('Medium') },
    { id: 'low', label: t('Low') }
  ]
  let priority: string = 'none'
  let element: HTMLButtonElement | undefined
  let opened = false

  // How a selector drives it: the popup is its own, anchored to the button element.
  function openPriority (): void {
    opened = true
    showPopup(ModernPopup, { items: priorities, selected: priority }, element, (result?: string) => {
      opened = false
      if (result !== undefined) priority = result
    })
  }
  $: priorityLabel = priorities.find((it) => it.id === priority)?.label
</script>

<div class="contexts">
  <section>
    <h3>Чипы диалога создания: secondary, по содержимому</h3>
    <div class="caption">small - вариант B, значение весом 400</div>
    <div class="row">
      <SelectButton {...icon('space')} label={t('Fusion')} />
      <SelectButton placeholder={t('No template')} />
      <SelectButton {...icon('backlog')} label={t('Backlog')} />
      <SelectButton {...icon('priority')} placeholder={t('No priority')} />
      <SelectButton empty={false}><ExampleAvatar initials="AS" />Sobolev Andrey</SelectButton>
      <SelectButton {...icon('tag')} placeholder={t('Labels')} />
      <SelectButton {...icon('component')} placeholder={t('No component')} />
      <SelectButton {...icon('milestone')} placeholder={t('Milestone')} />
      <SelectButton icon={ui.icon.Calendar} placeholder={t('Due date')} />
    </div>
    <div class="caption">medium - вариант A</div>
    <div class="row">
      <SelectButton size="medium" {...icon('space')} label={t('Fusion')} />
      <SelectButton size="medium" {...icon('backlog')} label={t('Backlog')} />
      <SelectButton size="medium" {...icon('priority')} placeholder={t('No priority')} />
      <SelectButton size="medium" empty={false}><ExampleAvatar initials="AS" />Sobolev Andrey</SelectButton>
      <SelectButton size="medium" {...icon('component')} placeholder={t('No component')} />
    </div>
  </section>

  <section>
    <h3>Панель атрибутов: ghost, растянута на колонку</h3>
    <div class="columns">
      {#each chevrons as chevron}
        <div class="attributes">
          <div class="caption">
            {chevron === false ? 'без стрелки' : chevron === true ? 'стрелка всегда' : 'стрелка при наведении'}
          </div>
          <span class="name">Status</span>
          <div class="fill">
            <SelectButton kind="ghost" {chevron} {...icon('progress')} label={t('In Progress')} />
          </div>
          <span class="name">Priority</span>
          <div class="fill">
            <SelectButton kind="ghost" {chevron} {...icon('priority')} placeholder={t('No priority')} />
          </div>
          <span class="name">Assignee</span>
          <div class="fill">
            <SelectButton kind="ghost" {chevron} pressed empty={false}>
              <ExampleAvatar initials="AS" />Sobolev Andrey
            </SelectButton>
          </div>
          <span class="name">Component</span>
          <div class="fill">
            <SelectButton
              kind="ghost"
              {chevron}
              {...icon('component')}
              label={t('Very long component name that does not fit')}
            />
          </div>
        </div>
      {/each}
    </div>
    <div class="caption">Assignee - попап открыт; Component - длинное значение</div>
  </section>

  <section>
    <h3>Поле формы: secondary, растянуто, со стрелкой</h3>
    <div class="columns">
      <div class="field">
        <SelectButton size="medium" chevron icon={ui.icon.Calendar} label={t('Europe/Tbilisi')} />
      </div>
      <div class="field"><SelectButton size="medium" chevron placeholder={t('Select type')} /></div>
      <div class="field"><SelectButton chevron icon={ui.icon.Calendar} label={t('Europe/Tbilisi')} /></div>
      <div class="field"><SelectButton chevron placeholder={t('Select type')} /></div>
    </div>
  </section>

  <section>
    <h3>Ячейка таблицы и карточка канбана</h3>
    <div class="caption">ghost small</div>
    <div class="row">
      <SelectButton kind="ghost" {...icon('high')} label={t('High')} />
      <SelectButton kind="ghost" {...icon('component')} label={t('Frontend')} />
      <SelectButton kind="ghost" {...icon('milestone')} placeholder={t('No milestone')} />
      <SelectButton kind="ghost" empty={false}><ExampleAvatar initials="KF" color="#e8743b" /></SelectButton>
    </div>
    <div class="caption">secondary extra-small</div>
    <div class="row">
      <SelectButton size="extra-small" {...icon('high')} label={t('High')} />
      <SelectButton size="extra-small" {...icon('component')} label={t('Frontend')} />
      <SelectButton size="extra-small" icon={ui.icon.Calendar} label={t('Oct 24')} />
    </div>
  </section>

  <section>
    <h3>Узкое место и несколько значений</h3>
    <div class="row">
      <div class="narrow"><SelectButton {...icon('component')} label={t('Very long component name')} /></div>
      <SelectButton {...icon('tag')} label={t('3 labels')} />
      <SelectButton empty={false}>
        <span class="stack"><ExampleAvatar initials="AS" /><ExampleAvatar initials="KF" color="#e8743b" /></span>
        4 members
      </SelectButton>
    </div>
    <div class="caption">первая - в обёртке 8rem: значение обрезается, полный текст - в подсказке места</div>
  </section>

  <section>
    <h3>Действие «Open» рядом, а не внутри</h3>
    <div class="row">
      <div class="with-action">
        <SelectButton empty={false}><ExampleAvatar initials="AS" />Sobolev Andrey</SelectButton>
        <span class="action">
          <IconButton icon={ui.icon.PencilLine} kind="ghost" size="small" tooltip={{ label: t('Open') }} />
        </span>
      </div>
    </div>
    <div class="caption">IconButton показывается при наведении на обёртку; раскладку делает редактор</div>
  </section>

  <section>
    <h3>С попапом</h3>
    <div class="row">
      <SelectButton
        bind:element
        pressed={opened}
        {...icon(priority === 'high' || priority === 'urgent' ? 'high' : 'priority')}
        label={priority === 'none' ? undefined : priorityLabel}
        placeholder={t('No priority')}
        on:click={openPriority}
      />
    </div>
    <div class="caption">клик открывает ModernPopup у кнопки, выбор меняет значение</div>
  </section>
</div>

<style lang="scss">
  .contexts {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    color: var(--theme-caption-color);
  }
  h3 {
    margin: 0 0 var(--spacing-1);
    font-size: 0.875rem;
    font-weight: 600;
  }
  .caption {
    margin: var(--spacing-1) 0 var(--spacing-0_5);
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-1);
  }
  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-4);
  }
  .attributes {
    display: grid;
    grid-template-columns: 6rem 14rem;
    align-items: center;
    row-gap: var(--spacing-0_5);

    .caption {
      grid-column: 1 / -1;
    }
  }
  .name {
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .fill,
  .field {
    display: grid;
  }
  .field {
    width: 16rem;
  }
  .narrow {
    display: grid;
    width: 8rem;
  }
  .stack {
    display: flex;

    & > :global(* + *) {
      margin-left: -0.375rem;
    }
  }
  .with-action {
    display: flex;
    align-items: center;
    gap: var(--spacing-0_5);

    .action {
      visibility: hidden;
    }
    &:hover .action {
      visibility: visible;
    }
  }
</style>
