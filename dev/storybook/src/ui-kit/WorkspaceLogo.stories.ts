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
import { WorkspaceLogo } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

// A picture the workspace could have uploaded; inline so the story needs no network.
const picture =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2b5f4a"/><circle cx="32" cy="32" r="16" fill="#f4d35e"/></svg>'
  )

const meta = {
  title: 'Navigation/WorkspaceLogo',
  component: WorkspaceLogo,
  args: { name: 'Intabia', size: 'small', notify: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** знак текущего воркспейса в панели приложений: картинка воркспейса или первая буква имени на заливке primary. **Не этот компонент:** аватар человека - `Avatar` из contact; иконка вида объекта - `IconBox`.\n\nНе кнопка: `role="img"` с именем воркспейса, клик и попап выбора воркспейса - у обёртки места. Пустой `src` или картинка, которая не загрузилась, - буква. `notify` - точка над углом на расстоянии от логотипа (новое в другом воркспейсе); озвучивается в имени («Intabia, Новая активность»). Размеры `small` (2rem) и `extra-small` (1.5rem, свёрнутая панель).'
      }
    }
  }
} satisfies Meta<WorkspaceLogo>

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
          title: 'Sizes',
          component: WorkspaceLogo,
          rows: axis('size', ['small', 'extra-small']),
          columns: [
            { title: 'letter', props: {} },
            { title: 'letter + notify', props: { notify: true } },
            { title: 'picture', props: { src: picture } },
            { title: 'picture + notify', props: { src: picture, notify: true } }
          ],
          props: { name: 'Intabia' }
        }
      ]
    }
  })
}
