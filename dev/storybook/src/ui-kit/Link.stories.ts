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
import { IconLink } from '@hcengineering/ui'
import { Link } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import LinkInText from './link/LinkInText.svelte'

const meta = {
  title: 'Buttons/Link',
  component: Link,
  args: { label: getEmbeddedLabel('Create an application'), href: undefined, external: false, disabled: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** ссылка в тексте: перейти по адресу (`href` - `<a>`, `external` - новая вкладка без доступа к странице) или текстовое действие без адреса (`<button>`, «Создать отклик» под пустым состоянием). **Не этот компонент:** действие-кнопка в ряду кнопок - `Button kind="ghost"` / `tertiary`; ссылка на объект платформы - презентер объекта.\n\nШрифт - от места, цвет основного текста; у адреса (`href`) в покое тонкое подчёркивание (в тексте ссылку иначе не найти), при наведении подчёркивание сплошное; выключенная - цвет disabled и курсор `not-allowed`. `disabled` у `<a>` убирает `href` (`aria-disabled`), у `<button>` - нативный `disabled`. Длинная подпись обрезается многоточием.'
      }
    }
  }
} satisfies Meta<Link>

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
          title: 'Kinds',
          component: Link,
          rows: [
            { title: 'button (no href)', props: {} },
            { title: 'anchor', props: { href: '#spec' } },
            { title: 'external', props: { href: 'https://example.com', external: true, icon: IconLink } }
          ],
          columns: [
            { title: 'default', props: {} },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label: getEmbeddedLabel('Create an application') }
        },
        {
          title: 'In text',
          component: LinkInText,
          rows: [{ title: 'paragraph', props: {} }],
          columns: [{ title: 'inherits font', props: {} }]
        }
      ]
    }
  })
}
