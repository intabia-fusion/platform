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

import type { Meta, StoryObj } from '@storybook/svelte'

import MeetingOverlay from './MeetingOverlay.svelte'

const meta = {
  title: 'Love/Meeting window (overlay)',
  component: MeetingOverlay,
  tags: ['!autodocs'],
  args: { mode: 'create', origin: 'planner', state: 'ready', invite: false, role: 'owner' },
  argTypes: {
    mode: { control: 'inline-radio', options: ['create', 'edit'] },
    origin: { control: 'inline-radio', options: ['planner', 'calendar'] },
    state: { control: 'inline-radio', options: ['ready', 'saving', 'invalid'] },
    role: { control: 'inline-radio', options: ['owner', 'member'] }
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '**Когда:** окно встречи поверх календаря и планировщика - создание из сетки планировщика (серия), создание из календаря (разовая) и настройки уже созданной встречи. Одно окно на все три случая: поля одни и те же, отличается только то, что в них заполнено и какие строки показываются.\n\nСостав: затемнённый экран (`--theme-overlay-color`), по центру карточка `Dialog` ширины `large`; шапка с названием окна и закрытием, прокручиваемое тело из блоков `Section`, подвал с «Отмена» / «Создать встречу» и (в режиме правки) «Удалить» слева.\n\nПравила затемнения: клик по затемнению не закрывает окно, а спрашивает подтверждение, если в форме есть несохранённое (имя, описание, время, участники); Escape делает то же самое. Пока идёт сохранение, затемнение остаётся перехватывать клики, а крестик и «Отмена» не работают - окно не закрывается на середине записи. Окно не перекрывает то, что в нём меняется: выбранный слот планировщика остаётся видимым за затемнением, чтобы было понятно, какое время правится.'
      }
    }
  }
} satisfies Meta<MeetingOverlay>

export default meta
type Story = StoryObj<typeof meta>

/** A click on a free slot of the planner grid: a standing meeting, the start and the length already taken from the slot. */
export const PlannerCreate: Story = {
  name: 'Создание в планировщике',
  args: { mode: 'create', origin: 'planner' }
}

/** A click on the calendar: a one-off meeting in an office room, no series - the room and the calendar switch differ. */
export const CalendarCreate: Story = {
  name: 'Создание в календаре',
  args: { mode: 'create', origin: 'calendar' }
}

/** The same window for a standing meeting that already exists: series, link, password, access and the running session. */
export const PermanentSettings: Story = {
  name: 'Настройки постоянной встречи',
  args: { mode: 'edit', origin: 'planner' }
}

/** The settings of a single meeting: the same fields, but the room is the one that changes. */
export const OneOffSettings: Story = {
  name: 'Настройки разовой встречи',
  args: { mode: 'edit', origin: 'calendar' }
}

/** Participants of both kinds are picked from the system or invited by mail, with a name of their own. */
export const InviteGuest: Story = {
  name: 'Приглашение гостя по почте',
  args: { mode: 'edit', origin: 'calendar', invite: true }
}

/** The same meeting for someone who was invited: everything is a value, no link settings, no delete. */
export const MemberPermanent: Story = {
  name: 'Участник: постоянная встреча',
  args: { mode: 'edit', origin: 'planner', role: 'member' }
}

/** A single meeting through the eyes of its participant: the room is read, the reminder is their own. */
export const MemberOneOff: Story = {
  name: 'Участник: разовая встреча',
  args: { mode: 'edit', origin: 'calendar', role: 'member' }
}

/** The name is the only field the form cannot take empty: the main action is off and the reason is under the field. */
export const InvalidName: Story = {
  name: 'Пустое название',
  args: { mode: 'create', origin: 'planner', state: 'invalid' }
}

/** While the meeting is written the window stays open and blocked: a spinner on the main action, no second submit. */
export const Saving: Story = {
  name: 'Сохранение',
  args: { mode: 'edit', origin: 'planner', state: 'saving' }
}
