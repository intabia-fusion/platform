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
import { Dialog } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import DialogExample from './dialog/DialogExample.svelte'

const create = getEmbeddedLabel('Create')

const meta = {
  title: 'Panels and dialogs/Dialog',
  component: Dialog,
  args: {
    label: getEmbeddedLabel('New channel'),
    width: 'medium',
    submitLabel: create,
    submitKind: 'brand',
    canSubmit: true,
    loading: false,
    padding: 'default',
    scrollable: true,
    closable: true,
    allowFullSize: false,
    footer: true,
    hideCancel: false,
    hideSubmit: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** диалог поверх экрана - создать, изменить, подтвердить, посмотреть: шапка с заголовком и закрытием, тело, футер с отменой и главным действием. Он же - встроенная панель (`embedded`: редактор в правой колонке настроек) и просмотрщик (`footer={false}`, `allowFullSize`). **Не этот компонент:** шаги с «Назад / Далее» - `WizardDialog`; меню и выбор из списка - попапы `MenuButton` / `Dropdown`; карточка создания объекта с полями атрибутов - `Card` из presentation.\n\nКорень - `<form>` с `role="dialog"` и именем из заголовка. Главная кнопка - `type="submit"`, `on:submit` приходит, только если `canSubmit` и не `loading`; Enter в поле отправляет, только с `submitOnEnter`. Крестик, «Отмена» и (с `closeOnEscape`) Escape шлют отменяемое `cancel`: `preventDefault()` оставляет диалог открытым (спросить про несохранённое), иначе следом `close` - его ловит хост попапа. В попапе Escape и клик мимо обрабатывает хост: он спрашивает `canClose()` компонента попапа, место-обёртка пробрасывает его в диалог (`export function canClose () { return dialog.canClose() }`) - тогда и они шлют отменяемое `cancel`. Не `embedded` - модальный (`aria-modal`): при открытии фокус в диалоге (на поле с автофокусом или на самой карточке), Tab и Shift+Tab ходят по кругу внутри, при закрытии фокус возвращается на элемент, который был в фокусе при открытии (кнопку-якорь `showPopup` пока снимает с фокуса до открытия, поле - нет). Ширины: `x-small` 25rem, `small` 30rem, `medium` 37.5rem, `large` 45rem (по умолчанию), `x-large` 58.25rem, `auto`, `full` (заполняет место). Слоты: `title` (после заголовка), `actions` (кнопки шапки), `footerStart` (подсказка, ошибка слева в футере), `footerActions` (кнопки между «Отменой» и главной; с `hideSubmit` - сами действия).'
      }
    }
  },
  render: (args) => ({ Component: DialogExample, props: { props: args } })
} satisfies Meta<Dialog>

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
          title: 'Widths',
          component: DialogExample,
          rows: axis('width', ['x-small', 'small', 'medium', 'large', 'x-large']),
          columns: [{ title: 'default', props: {} }],
          props: { body: 'text', submitLabel: create }
        },
        {
          title: 'Footer',
          component: DialogExample,
          rows: [
            { title: 'cancel + submit', props: {} },
            { title: 'canSubmit=false', props: { canSubmit: false } },
            { title: 'loading', props: { loading: true } },
            { title: 'hideCancel', props: { hideCancel: true, submitLabel: getEmbeddedLabel('Done') } },
            { title: 'submitKind=positive', props: { submitKind: 'positive', submitLabel: getEmbeddedLabel('Apply') } },
            {
              title: 'submitKind=negative',
              props: { submitKind: 'negative', submitLabel: getEmbeddedLabel('Archive') }
            },
            { title: 'submitKind=primary', props: { submitKind: 'primary' } },
            { title: 'footerStart + footerActions', props: { withFooterStart: true, withFooterActions: true } },
            { title: 'footer=false', props: { footer: false } }
          ],
          columns: [{ title: 'small', props: {} }],
          props: { width: 'small', body: 'text', submitLabel: create }
        },
        {
          title: 'Header',
          component: DialogExample,
          rows: [
            { title: 'label', props: {} },
            { title: 'title slot', props: { withTitle: true } },
            { title: 'actions slot', props: { withActions: true } },
            { title: 'allowFullSize', props: { allowFullSize: true, withActions: true } },
            { title: 'closable=false', props: { closable: false } }
          ],
          columns: [{ title: 'small', props: {} }],
          props: { width: 'small', body: 'text', footer: false }
        },
        {
          title: 'Body',
          component: DialogExample,
          rows: [
            { title: 'padding=default', props: { body: 'form' } },
            { title: 'padding=none', props: { body: 'list', padding: 'none' } },
            { title: 'scrolls in a lower host', props: { body: 'long', padding: 'none', frameHeight: '24rem' } }
          ],
          columns: [{ title: 'medium', props: {} }],
          props: { width: 'medium', submitLabel: create }
        },
        {
          title: 'Embedded',
          component: DialogExample,
          rows: [{ title: 'embedded', props: {} }],
          columns: [{ title: 'settings aside', props: {} }],
          props: {
            embedded: true,
            body: 'form',
            frameHeight: '22rem',
            label: getEmbeddedLabel('Edit attribute'),
            hideCancel: true,
            submitLabel: getEmbeddedLabel('Save'),
            closeOnEscape: true
          }
        }
      ]
    }
  })
}
