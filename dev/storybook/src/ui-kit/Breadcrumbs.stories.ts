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

import { getEmbeddedLabel } from '@hcengineering/platform'
import ui from '@hcengineering/ui'
import { Breadcrumb, Breadcrumbs } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import BreadcrumbsNarrow from './breadcrumbs/BreadcrumbsNarrow.svelte'
import BreadcrumbsWithBadge from './breadcrumbs/BreadcrumbsWithBadge.svelte'
import StoryAvatar from './breadcrumbs/StoryAvatar.svelte'

const settings = { icon: ui.icon.Sliders, label: getEmbeddedLabel('API and webhooks') }
const endpoint = { label: getEmbeddedLabel('Outgoing endpoint') }
const example = { label: getEmbeddedLabel('Outgoing example') }
const channel = { icon: ui.icon.Bubble, label: getEmbeddedLabel('general') }
const person = { icon: StoryAvatar, iconBox: false, label: getEmbeddedLabel('Anna Kovaleva') }
const thread = { label: getEmbeddedLabel('Thread') }
const project = { icon: ui.icon.Folder, label: getEmbeddedLabel('Product roadmap for the next quarter') }

const meta = {
  title: 'Navigation/Breadcrumbs',
  component: Breadcrumbs,
  args: { items: [settings, endpoint] },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** заголовок страницы или панели, когда до неё есть путь (настройки → раздел → объект, канал → тред), или один заголовок с иконкой. **Не этот компонент:** навигация между соседними разделами - `NavItem`; вкладки - `SegmentedControl`.\n\nПуть до текущей страницы в шапке: `nav` со списком, последняя крошка - текущая (`aria-current="page"`, не кликается), остальные - кнопки, клик сообщает индекс в `on:select`. Одна крошка - просто заголовок страницы. `Breadcrumb` - одна крошка отдельно (`current` - текущая). Подпись - `IntlString` (имя объекта - `getEmbeddedLabel`), аватар вместо иконки - `iconBox: false`. Слот `after` - плашка после пути (описание пространства).\n\nВ узкой шапке сначала обрезается путь, текущая крошка обрезается последней. Имя ориентира `nav` по умолчанию - «Хлебные крошки» (`ui.string.Breadcrumbs`); своё имя места - `aria-label` или `aria-labelledby`.'
      }
    }
  }
} satisfies Meta<Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Path',
          component: Breadcrumbs,
          rows: [
            { title: 'page title', props: { items: [settings] } },
            { title: 'title without icon', props: { items: [thread] } },
            { title: 'two levels', props: { items: [settings, endpoint] } },
            { title: 'three levels', props: { items: [settings, endpoint, example] } },
            { title: 'avatar', props: { items: [person, thread] } },
            { title: 'channel', props: { items: [channel, thread] } }
          ],
          columns: [{ title: 'Breadcrumbs', props: {} }]
        },
        {
          title: 'Breadcrumb',
          component: Breadcrumb,
          rows: [
            { title: 'link', props: {} },
            { title: 'current', props: { current: true } }
          ],
          columns: [
            { title: 'label', props: { label: thread.label } },
            { title: 'icon + label', props: settings },
            { title: 'avatar', props: person }
          ]
        },
        {
          title: 'After slot',
          component: BreadcrumbsWithBadge,
          rows: [
            { title: 'badge', props: { badge: 'Space for the design team' } },
            { title: 'empty', props: { badge: '' } }
          ],
          columns: [{ title: 'Breadcrumbs', props: { items: [project] } }]
        },
        {
          title: 'Truncation',
          component: BreadcrumbsNarrow,
          rows: [
            { title: 'one level', props: { items: [project] } },
            { title: 'two levels', props: { items: [project, endpoint] } },
            { title: 'three levels', props: { items: [settings, project, endpoint] } }
          ],
          columns: [
            { title: '12rem', props: { width: '12rem' } },
            { title: '24rem', props: { width: '24rem' } }
          ]
        }
      ]
    }
  })
}
